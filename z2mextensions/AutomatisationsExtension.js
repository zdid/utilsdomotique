"use strict";
//const stringify = require("json-stable-stringify-without-jsonify");
const stringify = JSON.stringify;
//const crypto = require("crypto");
const yaml_1 = require("yaml");
const fs     = require("fs");
const path   = require("path");
//const data_1 = require("data");
const ALLLOGLEVEL = null
function toArray(item) {
    return Array.isArray(item) ? item : [item];
}
var ConfigPlatform;
(function (ConfigPlatform) {
    ConfigPlatform["ACTION"] = "action";
    ConfigPlatform["STATE"] = "state";
    ConfigPlatform["NUMERIC_STATE"] = "numeric_state";
    ConfigPlatform["TIME"] = "time";
})(ConfigPlatform || (ConfigPlatform = {}));
var StateOnOff;
(function (StateOnOff) {
    StateOnOff["ON"] = "ON";
    StateOnOff["OFF"] = "OFF";
})(StateOnOff || (StateOnOff = {}));
var ConfigService;
(function (ConfigService) {
    ConfigService["TOGGLE"] = "toggle";
    ConfigService["TURN_ON"] = "turn_on";
    ConfigService["TURN_OFF"] = "turn_off";
    ConfigService["CUSTOM"] = "custom";
    ConfigService["MQTT"] = "mqtt";
})(ConfigService || (ConfigService = {}));
const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME_STRING_REGEXP = /^[0-9]{2}:[0-9]{2}:[0-9]{2}$/;
class Time {
    constructor(time) {
        if (!time) {
            const now = new Date();
            this.h = now.getHours();
            this.m = now.getMinutes();
            this.s = now.getSeconds();
        }
        else if (!TIME_STRING_REGEXP.test(time)) {
            throw new Error(`Wrong time string: ${time}`);
        }
        else {
            [this.h, this.m, this.s] = time.split(':').map(Number);
        }
    }
    isEqual(time) {
        return this.h === time.h
            && this.m === time.m
            && this.s === time.s;
    }
    isGreater(time) {
        if (this.h > time.h) {
            return true;
        }
        if (this.h < time.h) {
            return false;
        }
        if (this.m > time.m) {
            return true;
        }
        if (this.m < time.m) {
            return false;
        }
        return this.s > time.s;
    }
    isLess(time) {
        return !this.isGreater(time) && !this.isEqual(time);
    }
    isInRange(after, before) {
        if (before.isEqual(after)) {
            return false;
        }
        if (this.isEqual(before) || this.isEqual(after)) {
            return true;
        }
        let inverse = false;
        if (after.isGreater(before)) {
            const tmp = after;
            after = before;
            before = tmp;
            inverse = true;
        }
        const result = this.isGreater(after) && this.isLess(before);
        return inverse ? !result : result;
    }
}
class InternalLogger {
    constructor(logger) {
        this.logger = logger;
    }
    log(level, ...args) {
        if( ALLLOGLEVEL ) { 
            level=ALLLOGLEVEL;
        }
        const data = args.map((item) => typeof item === 'string' ? item : stringify(item)).join(' ');
        this.logger[level](`[AutomationsExtension] ${data}`);
    }
    debug(...args) {
        this.log('debug', ...args);
    }
    warning(...args) {
        this.log('warning', ...args);
    }
    info(...args) {
        this.log('info', ...args);
    }
    error(...args) {
        this.log('error', ...args);
    }
}
class AutomationsExtension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension, settings, baseLogger) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
        this.enableDisableExtension = enableDisableExtension;
        this.restartCallback = restartCallback;
        this.addExtension = addExtension;
        this.settings = settings;
        this.logger = new InternalLogger(baseLogger);
        this.mqttBaseTopic = settings.get().mqtt.base_topic;
        this.automations = this.parseConfig(settings.get().automations || {});
        this.automationsPrev = this.automations;
        let filename = path.resolve(path.join(__dirname,'..','automations.yaml'));
        this.logger.info("automations file path:", filename);
        fs.watchFile(filename,
  	    { 
            bigint: false,
            persistent: true,
            interval: 4000,
          },
          (curr, prev) => {
            this.logger.info("The file "+filename+" was edited, Previous Modified Time", prev.mtime,", Current Modified Time", curr.mtime);
            this.automations = this.parseConfig({})
            this.logger.debug('Registered automations', this.automations);
         }
	);

        this.timeouts = {};
        this.logger.info('Plugin loaded');
        this.logger.debug('Registered automations', this.automations);
        //this.logger.debug('mqtt', Object.keys(mqtt),"\n mqtt.client:", Object.keys(mqtt.client) );
    }
    createTriggersMinuterie(automations, minuterieName, minuteries) {
        minuteries.forEach((minuterie, indice) => {
            let name = minuterieName || ("minuterie_"+minuterie.entity) + String(indice) ;
            //let id =  crypto.randomUUID();
            const newTrigger = {
                trigger: {
                    platform: "state",
                    entity: minuterie.entity,
                    attribute: minuterie.attribute || 'state',
                    state: minuterie.state || StateOnOff.ON
                },
                action: {
                    entity:  minuterie.entity,
                    attribute: minuterie.attribute || 'state',
                    state: minuterie.state === StateOnOff.OFF ? StateOnOff.ON : StateOnOff.OFF,
                    for: minuterie.delay
                }
            };
            automations[name]=newTrigger();
        });
    }
    
    parseConfig(automations ) {
    	let filename = path.join(__dirname,'..','automations.yaml');
        this.logger.info("automations path : "+filename);
            automations = fs.readFileSync(filename,{encoding: 'utf8'});
        if(automations) {
        try {  
            automations = yaml_1.parse(automations)
            this.logger.info("parse du fichier ", filename, "OK")
            this.automationsPrev = automations;
        }catch (e) {
                this.logger.warning("convert yaml error:", e);
                automations = undefined;
            }
        } else {
            automations = undefined
        } 
        try {
            
        
        automations = (!automations && this.automationsPrev)? automationsPrev: (automations || {});

            // generation des automatisations de type minuteries
        let minuteries = toArray(automations.minuteries || [])
        let minuterie  = toArray(automations.minuterie || []);
        minuteries = minuteries.concat(minuterie);
        delete automations.minuteries;
        delete automations.minuterie;
                   this.logger.error("try 1 avant create triggers", minuteries.length)

        if(minuteries.length > 0) this.createTriggersMinuterie(automations,"",minuteries);
                   this.logger.error("try 1 apres create triggers")

        } catch (error) {
            this.logger.error("plantage avant le reduce 0"+error)
        }
        try{
        Object.keys(automations).forEach((automationName, indice) =>  {
            this.logger.error("boucle 1 automationname", automationName)
            let minuteries = toArray(automations[automationName].minuteries || [])
            let minuterie  = toArray(automations[automationName].minuterie || []);
            minuteries = minuteries.concat(minuterie);
            delete automations[automationName].minuteries;
            delete automations[automationName].minuterie;
                this.logger.error("try 2 avant create triggers", automationName, minuteries)


            if(minuteries.length > 0) this.createTriggersMinuterie(automations,automationName,minuteries);
                   this.logger.error("try 2 apres create triggers", automationName)
       });        

        Object.keys(automations).forEach((name,indice)=>{
           this.logger.error("boucle 2 automationname", name)
            automations[name].name=name;
        });
        } catch (error) {
            this.logger.error("plantage avant le reduce 1"+error)
        }
        const services = Object.values(ConfigService);
        const platforms = Object.values(ConfigPlatform);
        return Object.values(automations).reduce((result, automation) => {
            const platform = automation.trigger.platform;
            if (!platforms.includes(platform)) {
                this.logger.warning(`regle :${automation.name}, Config validation error ${automation.name}: unknown trigger platform '${platform}'`);
                return result;
            }
            if (!automation.trigger.entity) {
                this.logger.warning(`regle :${automation.name}, Config validation error ${automation.name}: trigger entity not specified`);
                return result;
            }
            const actions = toArray(automation.action);
            for (const action of actions) {
                if (!services.includes(action.service)) {
                    this.logger.warning(`regle :${nameregle}, Config validation error ${automation.name}: unknown service '${action.service}'`);
                    return result;
                }
            }
            const conditions = automation.condition ? toArray(automation.condition) : [];
            for (const condition of conditions) {
                if (!platforms.includes(condition.platform)) {
                    this.logger.warning(`Config validation error ${automation.name}: unknown condition platform '${condition.platform}'`);
                    return result;
                }
            }
            const entities = toArray(automation.trigger.entity);
            for (const entityId of entities) { 
                if (!result[entityId]) {
                    result[entityId] = [];
                }
                result[entityId].push({
                    id: automation.name, //crypto.randomUUID(),
                    name: automation.name,
                    trigger: automation.trigger,
                    action: actions,
                    condition: conditions,
                });
            }
            return result;
           
        }, {});
    }
    checkTrigger(configTrigger, update, from, to,nameregle) {
        let trigger;
        let attribute;
        switch (configTrigger.platform) {
            case ConfigPlatform.ACTION:
                if (!update.hasOwnProperty('action')) {
                    return null;
                }
                trigger = configTrigger;
                const actions = toArray(trigger.action);
                return actions.includes(update.action);
            case ConfigPlatform.STATE:
                trigger = configTrigger;
                attribute = trigger.attribute || 'state';
                if (!update.hasOwnProperty(attribute) || !from.hasOwnProperty(attribute) || !to.hasOwnProperty(attribute)) {
                    return null;
                }
                if (from[attribute] === to[attribute]) {
                    return null;
                }
                const states = toArray(trigger.state);
                this.logger.warning("regle:", nameregle,"ConfigPlatform.STATE:"+states.includes(update[attribute]));

                return states.includes(update[attribute]);
            case ConfigPlatform.NUMERIC_STATE:
                trigger = configTrigger;
                attribute = trigger.attribute;
                if (!update.hasOwnProperty(attribute) || !from.hasOwnProperty(attribute) || !to.hasOwnProperty(attribute)) {
                    return null;
                }
                if (from[attribute] === to[attribute]) {
                    return null;
                }
                if (typeof trigger.above !== 'undefined') {
                    if (to[attribute] < trigger.above) {
                        return false;
                    }
                    if (from[attribute] >= trigger.above) {
                        return null;
                    }
                }
                if (typeof trigger.below !== 'undefined') {
                    if (to[attribute] > trigger.below) {
                        return false;
                    }
                    if (from[attribute] <= trigger.below) {
                        return null;
                    }
                }
                return true;
        }
        return false;
    }
    checkCondition(condition) {
        if (condition.platform === ConfigPlatform.TIME) {
            return this.checkTimeCondition(condition);
        }
        return this.checkEntityCondition(condition);
    }
    checkTimeCondition(condition) {
        const beforeStr = condition.before || '23:59:59';
        const afterStr = condition.after || '00:00:00';
        const weekday = condition.weekday || WEEK;
        try {
            const after = new Time(afterStr);
            const before = new Time(beforeStr);
            const current = new Time();
            const now = new Date();
            const day = now.getDay();
            return current.isInRange(after, before) && weekday.includes(WEEK[day]);
        }
        catch (e) {
            this.logger.warning(e);
            return true;
        }
    }
    checkEntityCondition(condition,nameregle) {
        if (!condition.entity) {
            this.logger.warning(`Regle: ${nameregle}, Config validation error : condition entity not specified`);
            return true;
        }
        const entity = this.zigbee.resolveEntity(condition.entity);
        if (!entity) {
            this.logger.warning(`Regle: ${nameregle}, Condition not found for entity '${condition.entity}'`);
            return true;
        }
        let currentCondition;
        let currentState;
        let attribute;
        switch (condition.platform) {
            case ConfigPlatform.STATE:
                currentCondition = condition;
                attribute = currentCondition.attribute || 'state';
                currentState = this.state.get(entity)[attribute];
                if (currentState !== currentCondition.state) {
                    return false;
                }
                break;
            case ConfigPlatform.NUMERIC_STATE:
                currentCondition = condition;
                attribute = currentCondition.attribute;
                currentState = this.state.get(entity)[attribute];
                if (typeof currentCondition.above !== 'undefined' && currentState < currentCondition.above) {
                    return false;
                }
                if (typeof currentCondition.below !== 'undefined' && currentState > currentCondition.below) {
                    return false;
                }
                break;
        }
        return true;
    }
    runActionMqttSend(action, nameregle) {
    	this.logger.info(`regle: ${nameregle} RunActionMqttSend: `,action)
    	let topic = action.topic;
    	let message = action.message;
    	if(! message || !topic){
    		this.logger.error('Regle:',nameregle, 'action mqtt no data "message" or "topic"') 
    		return;
    	}
    	this.mqtt.publish(topic,message);
    }
    createTimeout(action,nameregle,indice) {
        this.timeouts[nameregle+'--'+indice] = setTimeout(() => {
           this.runActions([action], nameregle, indice,true); 
        }, timeout);
        this.timeouts[nameregle+'--'+indice].unref();
    }
    runActions(actions, nameregle, isTimeout) {
        let i = 0;
        for (const action of actions) {
            i = i+1;
            if(action.service === ConfigService.MQTT) {
                this.runActionMqttSend(action,nameregle)
                continue;
            }
            if(this.timeouts[nameregle+i]){
                clearTimeout(this.timeouts[nameregle+i]);
            }
            delete this.timeouts[nameregle+i];
            if(action.for && ! isTimeout) {
                createTimeout(action,nameregle, i);
                return;
            }



	        const destination = this.zigbee.resolveEntity(action.entity);
            if (!destination) {
                this.logger.debug(`regle :${nameregle}, Destination not found for entity '${action.entity}'`);
                continue;
            }
            let attribute = action.attribute || 'state';
            const currentState = this.state.get(destination)[attribute];
            this.logger.debug(`regle :${nameregle}, ${currentState}, attribute ${attribute}`)
            let newState;
            let data = {};
            switch (action.service) {
                case ConfigService.TURN_ON:
                    data[attribute] = newState =  StateOnOff.ON ;
                    break;
                case ConfigService.TURN_OFF:
                    data[attribute] = newState =  StateOnOff.OFF ;
                    break;
                case ConfigService.TOGGLE:
                    data[attribute] = newState = ( currentState === StateOnOff.ON ? StateOnOff.OFF : StateOnOff.ON );
                    break;
                case ConfigService.CUSTOM:
                    data = action.data;
                    break;
           }
           if (newState && currentState === newState  ) {
                continue;
           }
           this.logger.debug(`regle: ${nameregle}, Run automation for entity '${action.entity}':`, action, `execution send newState: "${newState}"`);
           this.mqtt.onMessage(`${this.mqttBaseTopic}/${destination.name}/set`, stringify(data));
        }
    }

    runActionsWithConditions(conditions, actions,nameregle,isTimeout) {
        for (const condition of conditions) {
            if (!this.checkCondition(condition,nameregle)) {
                return;
            }
        }
        this.runActions(actions,nameregle, isTimeout);
    }
    stopTimeout(automationId) {
	this.logger.debug(`stop timeout de id: ${automationId}`)
	const timeout = this.timeouts[automationId];
        if (timeout) {
            this.logger.error(`stop timeout de id: ${automationId}`)
            clearTimeout(timeout);
            delete this.timeouts[automationId];
        }
    }
    startTimeout(automation, time) {
        this.logger.debug('Regle: ', automation.name,'Start timeout in '+(time*1000)+' for automation', automation.trigger);
        const timeout = setTimeout(() => {
            delete this.timeouts[automation.id];
            this.logger.error("regle "+automation.name+", execution timeout");
            this.runActionsWithConditions(automation.condition, automation.action,automation.name);
        }, time * 1000);
        timeout.unref();
        this.timeouts[automation.id] = timeout;
    }
    runAutomationIfMatches(automation, update, from, to) {
        const triggerResult = this.checkTrigger(automation.trigger, update, from, to,automation.regle);
        if (triggerResult === false) {
            this.stopTimeout(automation.id);
            return;
        }
        if (triggerResult === null) {
            return;
        }
        this.logger.debug('regle:', automation.name, 'Start automation', automation);
        const timeout = this.timeouts[automation.id];
        if (timeout) {
            return;
        }
        if (automation.trigger.for) {
            this.startTimeout(automation, automation.trigger.for);
            return;
        }
        this.runActionsWithConditions(automation.condition, automation.action);
    }
    findAndRun(entityId, update, from, to) {
        const automations = this.automations[entityId];
        if (!automations) {
            return;
        }
      this.logger.debug("findAndRun "+entityId+" automations "); //+JSON.stringify(automations));
      
      for (const automation of automations) {
            this.runAutomationIfMatches(automation, update, from, to);
        }
    }
    async start() {
        this.eventBus.onStateChange(this, (data) => {
            this.findAndRun(data.entity.name, data.update, data.from, data.to);
        });
    }
    async stop() {
        this.eventBus.removeListeners(this);
    }
}

module.exports = AutomationsExtension;
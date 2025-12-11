"use strict";
/**
 * Extension Zigbee2MQTT : Conversion et filtrage des messages de Discovery.
 * Doit être placé dans le répertoire data/external_extensions/
 * Nom de fichier suggéré : multi_platform_converter.mjs
 */
const fs = require('fs');
const path = require('path');
//const { connectAsync } = require('mqtt-packet-async');
const mqtt = require('mqtt');
var ALLLOGLEVEL = null; // 'debug', 'info', 'warning', 'error' ou null pour le niveau par défaut
class InternalLogger {
    constructor(logger) {
        this.logger = logger;
    }
    log(level, ...args) {
        
        if( ALLLOGLEVEL ) { 
            level=ALLLOGLEVEL;
        }

        const data = args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
        this.logger[level](`[AExtensionController] ${data}`);
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
function     getMethods(instance) {
      // 1. Obtenir le prototype de l'instance
      const proto = Object.getPrototypeOf(instance);
   
      // 2. Obtenir tous les noms de propriétés propres (y compris constructor, getters/setters)
      const allProperties = Object.getOwnPropertyNames(proto);

      // 3. Filtrer pour ne garder que les fonctions et exclure 'constructor'
      const methods = allProperties.filter(prop => {
       // Obtenir le descripteur de propriété pour vérifier si c'est une fonction (méthode)
      const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
      // Une méthode régulière aura un 'value' qui est une fonction.
      // Un accesseur (getter/setter) aura 'get' ou 'set' défini, pas 'value'.
      // Les accesseurs sont souvent considérés comme des propriétés et non des méthodes 'action'.
      // On exclut explicitement 'constructor'.
    return prop !== 'constructor' && typeof descriptor.value === 'function' && prop.startsWith('on')   ;
    
    });

    return methods;
    }

// Utilisez la syntaxe de module ES (ESM) pour l'exportation par défaut
class AExtensionController {

    CONVERSION_RULES = {
        'lumiere': 'light',
        'light': 'light',
        'ampoule': 'light',
        'lampadaire': 'light',
        'lampe': 'light',
        'leds': 'light',
        'chevet': 'light',
        'applique': 'light',
        'plafonnier': 'light',
        'eclairage': 'light',
        'ventil': 'fan',
        'ventilo': 'fan',
        'ventilateur': 'fan',
        'vmc': 'fan',
        'fan': 'fan',
        'climatis': 'fan',
        'skip': 'SKIP_MESSAGE', 
        'bloquer': 'SKIP_MESSAGE' 
    };
    
    CONVERTION_NAMERULES_ORDERED = []
    
    
    // Le constructeur doit accepter toutes les dépendances de Z2M, même si elles ne sont pas utilisées.
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension, settings, baseLogger) {
        // Stocker uniquement les dépendances nécessaires
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
    
                this.jsonfilePath = path.resolve(path.join(__dirname, 'decouverte_switch.json'));
                this.decouverte = {};
                this.CONVERTION_NAMERULES_ORDERED = JSON.parse(
                    this.removeAccentsToLowercase(
                        JSON.stringify(Object.keys(this.CONVERSION_RULES))
                    )
                  )
                  .sort()
                  .reverse();
          
    }
    async disconnect() {
        this.eventBus.removeListeners(this);
        this.logger.info("Disconnecting from MQTT server");
        await this.client?.endAsync();
    }
    async connect() {
        const mqttSettings = this.settings.get().mqtt;

       this.logger.info(`Connecting to MQTT server at ${mqttSettings.server}`);

        const options = {
            properties: {maximumPacketSize: mqttSettings.maximum_packet_size},
        };

        if (mqttSettings.version) {
            options.protocolVersion = mqttSettings.version;
        }

        if (mqttSettings.keepalive) {
           this.logger.debug(`Using MQTT keepalive: ${mqttSettings.keepalive}`);
            options.keepalive = mqttSettings.keepalive;
        }

        if (mqttSettings.ca) {
           this.logger.debug(`MQTT SSL/TLS: Path to CA certificate = ${mqttSettings.ca}`);
            options.ca = fs.readFileSync(mqttSettings.ca);
        }

        if (mqttSettings.key && mqttSettings.cert) {
           this.logger.debug(`MQTT SSL/TLS: Path to client key = ${mqttSettings.key}`);
           this.logger.debug(`MQTT SSL/TLS: Path to client certificate = ${mqttSettings.cert}`);
            options.key = fs.readFileSync(mqttSettings.key);
            options.cert = fs.readFileSync(mqttSettings.cert);
        }

        if (mqttSettings.user && mqttSettings.password) {
           this.logger.debug(`Using MQTT login with username: ${mqttSettings.user}`);
            options.username = mqttSettings.user;
            options.password = mqttSettings.password;
        } else if (mqttSettings.user) {
           this.logger.debug(`Using MQTT login with username only: ${mqttSettings.user}`);
            options.username = mqttSettings.user;
        } else {
           this.logger.debug("Using MQTT anonymous login");
        }

        // if (mqttSettings.client_id) {
        //    this.logger.debug(`Using MQTT client ID: '${mqttSettings.client_id}'`);
        //     options.clientId = mqttSettings.client_id;
        // }

        // if (mqttSettings.reject_unauthorized !== undefined && !mqttSettings.reject_unauthorized) {
        //    this.logger.debug("MQTT reject_unauthorized set false, ignoring certificate warnings.");
        //     options.rejectUnauthorized = false;
        // }

        this.client = await mqtt.connectAsync(mqttSettings.server, options);

        this.client.stream.setMaxListeners(0);

        this.client.on("error", (err) => {
           this.logger.error(`MQTT error: ${err.message}`);
        });

        // if (mqttSettings.version != null && mqttSettings.version >= 5) {
        //     this.client.on("disconnect", (packet) => {
        //        this.logger.error(`MQTT disconnect: reason ${packet.reasonCode} (${packet.properties?.reasonString})`);
        //     });
        // }

//        this.client.on("message", this.onMessage);

        await this.onConnect();

        this.client.on("connect", this.onConnect);

        // this.republishRetainedTimer = setTimeout(async () => {
        //     // Republish retained messages in case MQTT broker does not persist them.
        //     // https://github.com/Koenkk/zigbee2mqtt/issues/9629
        //     for (const msg of Object.values(this.retainedMessages)) {
        //         await this.publish(msg.topic, msg.payload, msg.options);
        //     }
        // }, 2000);

        // Set timer at interval to check if connected to MQTT server.
        // this.connectionTimer = setInterval(() => {
        //     if (!this.isConnected()) {
        //        this.logger.error("Not connected to MQTT server!");
        //     }
        // }, utils.seconds(10));
    }
     async onConnect() {
       this.logger.info("Connected to MQTT server");
    }
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    removeAccentsToLowercase (str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()   ;
    }
     /**
     * traitement pour degager l'area cible du nom de l'entité
     * 
     * @param {*} message 
     * @returns 
     */
    changeNommage(data) {
      
         this.logger.info("change nommage", data.message.state_topic)
         let topi = data.message.state_topic || '';
         this.logger.debug("topi",topi)
 
         let friendlyNameId = topi.split('/')[1]||'';
         if (friendlyNameId.includes('--')) {
            let names = friendlyNameId.split('--');
             let suggestedArea = names[0]
             let devicename = this.capitalize(names[1]);
             data.message.device.name = devicename;
             //data.message.name = convertPlatform2Libel(data)
              /* 
                //TODO revoir aussi le default_entity_id et l object_id
                // pour reprendre la totalité de friendlyNameId dans ces données
                // (en fait je ne sais pas si c'est utile)
               */
              data.message.device.suggested_area = this.capitalize(
                suggestedArea.trim()
                 .replaceAll('_',' ')
                 .replaceAll(' a ', ' à ')
                 .replaceAll(' d ', ' d\'')
             );
             
             this.logger.debug(`changeNommage, suggested_area: ${data.message.suggested_area}`)
         }
         return data;
    }
 
  
    /**
     * teste le friendly name  si conversion nécessaire lumière ventilo
     * @param {*} message 
     * @returns 'light' ou 'fan' ou ''
     */
    test(message) {
        let result = '';
        let i =0;
        this.logger.error(`[Extension] test switch entity_id ${message.default_entity_id}`);
        const friendlyNameId = this.removeAccentsToLowercase(message.default_entity_id||'')
        for(i=0; i<this.CONVERTION_NAMERULES_ORDERED.length && ! result; i++) {
                 const keyword = this.removeAccentsToLowercase(this.CONVERTION_NAMERULES_ORDERED[i])  ;
                 //this.logger.error(`[Extension] test switch keyword: ${keyword} in ${friendlyNameId} ${message.default_entity_id}`);
            if (friendlyNameId.includes(keyword)) {
                result= this.CONVERSION_RULES[keyword]
            }
        }

        return result;
    }
    convertSwitchToOther (data)  {     
        this.logger.debug(`[Extension]  Platform switch: ${data.topic}`);
        if(data.topics.config == 'switch' || data.topics.config.startsWith('switch_l')) {
            const word = this.test(data.message);
            this.logger.info(`[Extension] Mot clé détecté: ${word} pour le topic: ${data.topic}`);
           if(word === 'SKIP_MESSAGE') {
              this.logger.info(`[Extension] BLOCAGE : Discovery pour le topic: ${data.topic} annulé.`);
              data = null; // Annule la publication
           } else  if (word)  {
              data.topics.platform = word;

              if(! data.message.state_on && data.message.payload_on ) {
                data.message.state_on = data.message.payload_on
              }
              if(! data.message.state_off && data.message.payload_off ) {
                data.message.state_off = data.message.payload_off
              }
              //data.message.name =''; //on essaie pour eviter d'avoir light ou fan
              //data  = this.switch2new(word,data.topic, message);
              this.logger.info(`[Extension] Conversion switch -> ${word} pour le topic: ${data.topic}`);
           } // else   on ne fait rien
        }
        return data;
    }
    
    async onMQTTMessage(data) {
        let message;
        try {
            data.message = JSON.parse(data.message.toString());
        } catch (error) {
             this.logger.error(`[Extension] Erreur de parsing JSON pour le topic: ${data.topic}, message ${data.message} ignoré.`);        
        }

        let topics = data.topic.split('/');
        data.topics = {
            prefix: topics[0],
            platform: topics[1],
            num: topics[2],
            config: topics[3],
            reste: topics[4] 
        }
        if(data) {
            data = this.changeNommage(data);
        }

        if(data.topics.platform == 'switch') { 
            data = this.convertSwitchToOther(data);
        } 
        if(data && typeof data.message === 'object') {
            data.message = Buffer.from( JSON.stringify(data.message) );
        }  

        if(data && data.topic ) {
            data.topics.prefix = 'homeassistant'
            data.topic = [ data.topics.prefix, data.topics.platform, data.topics.num, data.topics.config ].join('/')
            if(data.topics.reste) { data.topic +="/"+data.topics.reste }
            await this.client.publishAsync(data.topic, data.message, { retain: true } );
            this.logger.info(`[Extension] Publication MQTT modifiée pour le topic: ${data.topic}\n    message ${data.message}`);
        }
    }
    start() {
        this.connect()
        this.logger.error('[Extension] AExtensionController démarrée.');
        //this.logger.error('[Extension] liste des methods on  eventbus...');
        //  getMethods(this.mqtt).forEach(prop => {
        //      this.logger.error(`[Extension] mqtt Property: ${prop}`);
        //  });

        // getMethods(this.eventBus).forEach(prop => {
        //      this.logger.error(`[Extension] EventBus Property: ${prop}`);
        // });
        this.prefixtopic = this.settings.get().homeassistant.discovery_topic;
        this.logger.error(`[Extension] mqtt.homeassistant.discovery_topic: ${this.prefixtopic}`);
        this.eventBus.onMQTTMessage(this, (data) => {
            this.logger.debug(`onMQTTMessage for topic: ${data.topic}`);
            if(data.topic.startsWith(this.prefixtopic + '/') && data.topic.endsWith('/config') ) {
                this.logger.error(`onMQTTMessage for topic: ${data.topic}, je vais le traiter, type payload: ${typeof data.payload}`);
                //data.message=data.payload;
                this.onMQTTMessage(data);
            }
        });
 


        this.eventBus.onMQTTMessagePublished(this, (data) => {
 //           this.logger.error(`onMQTTMessage for topic: ${data.topic}`);
            if(data.topic.startsWith(this.prefixtopic + '/') && data.topic.endsWith('/config') ) {
                this.logger.error(`onMQTTMessagePublished for topic: ${data.topic}, je vais le traiter, type payload: ${typeof data.payload}`);
                data.message=data.payload;
                this.onMQTTMessage(data);
            }
        });
    }

    stop(reason ) {
        this.eventBus.removeListeners(this);
        this.disconnect();
        //fs.writeFileSync(this.jsonfilePath, JSON.stringify(this.decouverte, null, 4), 'utf-8');
        this.logger.error('[Extension] AExtensionControler arrêtée.',reason)
    }
    
}
module.exports =  AExtensionController ;

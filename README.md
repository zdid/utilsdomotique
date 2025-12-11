Ce sont des programmes utilitaires pour Z2M (extensions) ou pour home assistant 
- AExtensionController: programme de modification des discovery mqtt de z2m pour ajout de suggested_area et transformation des switchs en light ou fan
- Automatisations : programme d'automatisation placé au niveau de Z2M (en cas de pb avec homeassistant) ex: detecteur allumage de toilette etc

pour home assistant
- suppressDiscovery: suppression des objets discovery en envoyant a home assistant l'information des devices disparues
  dans mon cas, les bons seront recréés automatiquement
  par mes programmes rfxcom2hass arexx2hass et zigbee2mqtt et mes extensions

  Precision importante:
  l'extension automatisation est un fork https://github.com/Anonym-tsk/zigbee2mqtt-extensions

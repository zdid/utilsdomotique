L'objectif des utilitaires actuels est d'intervenir le moins possible dans home assistant lorsque les entrées viennent de mqtt.

Ce sont des programmes utilitaires pour Z2M (extensions) ou pour home assistant 
- AExtensionController: programme de modification des discovery mqtt de z2m pour ajout de suggested_area et transformation des switchs en light ou fan friendly name "salle à manger--lampadaire"
lampadaire me dit que c'est une lumière (transformation des switchs en light) et salle à manger est le suggested area
le séparateur -- délimite les 2
- Automatisations : programme d'automatisation placé au niveau de Z2M (en cas de pb avec homeassistant) ex: detecteur allumage de toilettes etc
l'extension automatisation est un fork https://github.com/Anonym-tsk/zigbee2mqtt-extensions


pour home assistant
- suppressDiscovery: suppression des objets mqtt "discovery" en envoyant a home assistant l'information des "devices" disparus
  dans mon cas, les bons seront recréés automatiquement
  par mes programmes rfxcom2hass arexx2hass et le couple zigbee2mqtt AextensionController

  

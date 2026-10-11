/* Suggestion lists for the builder's pickers: what to offer when a skill or trait needs a specialty or a name typed in.
   Hand-authored (not generated). Each entry is [name, category]. Anything not listed can still be typed in.
   byAsk is keyed by the profession data's "ask" word; bySkill by the skill's name and wins when both exist. */
(function (G) {
  const L = (cat, ...names) => names.map(n => [n, cat]);
  const MONSTERS = [
    ...L("Undead", "Zombie", "Skeleton", "Ghoul", "Ghost", "Wight", "Vampire", "Mummy", "Wraith", "Banshee", "Lich"),
    ...L("Demons and spirits", "Demon", "Imp", "Devil", "Elemental", "Nature Spirit", "Free Spirit", "Angel", "Daemon"),
    ...L("Faerie", "Faerie", "Pixie", "Sprite", "Satyr", "Dryad", "Unicorn"),
    ...L("Humanoids", "Orc", "Goblin", "Hobgoblin", "Kobold", "Troll", "Ogre", "Giant", "Gnoll", "Lizard Man", "Minotaur", "Centaur"),
    ...L("Shapeshifters", "Lycanthrope", "Werewolf", "Wererat", "Doppelganger", "Shapeshifter"),
    ...L("Beasts", "Dragon", "Wyvern", "Griffin", "Hydra", "Basilisk", "Giant Spider", "Giant Rat", "Owlbear", "Bear", "Wolf", "Snake", "Insect"),
    ...L("Constructs and oddities", "Golem", "Gargoyle", "Animated Object", "Ooze", "Gelatinous Cube", "Plant Monster", "Mimic", "Beholder"),
  ];
  const LANGUAGES = [
    ...L("Common", "Common", "Trade Tongue", "Elvish", "Dwarvish", "Halfling", "Gnomish", "Orcish", "Goblin", "Draconic", "Giant"),
    ...L("Magical and holy", "Celestial", "Infernal", "Abyssal", "Sylvan", "Primordial", "Angelic", "Demonic", "Latin", "Ancient Tongue"),
    ...L("Real world", "English", "French", "German", "Spanish", "Italian", "Greek", "Arabic", "Hebrew", "Sanskrit", "Chinese", "Japanese", "Norse", "Egyptian"),
  ];
  const HIDDEN_LORE = [
    ...L("Spirits and the dead", "Demons", "Demon Lore", "Spirits", "Spirit Lore", "Free Spirits", "Restless Undead", "Undead", "Angels", "Nature Spirits", "Elementals", "Ghosts", "Vampires", "Mummies"),
    ...L("Creatures", "Faeries", "Faerie Lore", "Lycanthropes", "Cryptozoology", "Dragons", "Giants"),
    ...L("Magic and secrets", "Magic Items", "Magical Writings", "Conspiracies", "Sacred Places", "Earth", "Supers", "Artifacts", "Cults", "Lost Civilizations"),
  ];
  const INSTRUMENTS = [
    ...L("Strings", "Lute", "Harp", "Fiddle", "Lyre", "Guitar", "Cello", "Zither", "Banjo"),
    ...L("Wind", "Flute", "Pipes", "Bagpipes", "Horn", "Trumpet", "Recorder", "Oboe", "Panpipes"),
    ...L("Percussion and keys", "Drum", "Bells", "Tambourine", "Cymbals", "Harpsichord", "Organ", "Piano"),
    ...L("Voice", "Singing"),
  ];
  const RELIGIONS = [
    ...L("Rites", "Christian", "Jewish", "Muslim", "Hindu", "Buddhist", "Shinto", "Pagan", "Druidic", "Egyptian", "Norse", "Greek and Roman"),
    ...L("Fantasy", "Light-god", "Dark-god", "Nature faith", "Ancestor worship", "Demon cult", "Elemental rites", "Holy order of the campaign"),
  ];
  const PHILOSOPHIES = L("Schools", "Ethics", "Logic", "Metaphysics", "Stoicism", "Epicureanism", "Platonism", "Aristotelianism", "Scholasticism", "Confucianism", "Taoism", "Nihilism", "Existentialism");
  const PSYCH = L("Kinds", "Human", "Elf", "Dwarf", "Orc", "Undead", "Demon", "Faerie", "Animal", "Dragon", "Giant");
  const DISGUISE = L("Kinds", "Human", "Elf", "Dwarf", "Orc", "Animals", "Facial Hair", "Makeup", "Costumes", "Social Class", "Gender", "Age");
  G.BC_PICKS = {
    byAsk: {
      "language": LANGUAGES,
      "monster type": MONSTERS, "same monster type": MONSTERS, "other monster type": MONSTERS,
    },
    bySkill: {
      "Physiology": MONSTERS, "Psychology": PSYCH, "Hidden Lore": HIDDEN_LORE, "Musical Instrument": INSTRUMENTS,
      "Religious Ritual": RELIGIONS, "Theology": RELIGIONS, "Philosophy": PHILOSOPHIES, "Disguise": DISGUISE,
      "Anthropology": L("Species", "Human", "Elf", "Dwarf", "Orc", "Halfling", "Gnome", "Goblin", "Giant", "Lizard Man"),
      "Area Knowledge": L("Places", "Home city", "Home barony", "The nearest dungeon", "The capital", "The Borderlands"),
      "Language": LANGUAGES, "Naturalist": L("Regions", "Temperate", "Arctic", "Desert", "Jungle", "Swampland", "Mountain", "Underground"),
      "Survival": L("Terrain", "Arctic", "Desert", "Island/Beach", "Jungle", "Mountain", "Plains", "Swampland", "Woodlands", "Underground"),
    },
    languages: LANGUAGES, monsters: MONSTERS,
  };
})(globalThis);

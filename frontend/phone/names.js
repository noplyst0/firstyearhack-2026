// Random name generator ("Adjective Animal", <= 16 chars) per plan/phone.md
(() => {
  'use strict';

  const ADJECTIVES = [
    'Wobbly', 'Sneaky', 'Turbo', 'Sleepy', 'Wonky', 'Spicy',
    'Fuzzy', 'Cosmic', 'Jolly', 'Zippy', 'Grumpy', 'Bouncy',
  ];

  const ANIMALS = [
    'Penguin', 'Llama', 'Otter', 'Badger', 'Pigeon', 'Walrus',
    'Noodle', 'Toaster', 'Panda', 'Goose', 'Hamster', 'Squid',
  ];

  let lastGenerated = '';

  function generateName(excludeName) {
    const avoid = excludeName || lastGenerated;
    for (let attempt = 0; attempt < 20; attempt++) {
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
      const candidate = `${adj} ${animal}`.slice(0, 16);
      if (candidate.toLowerCase() !== (avoid || '').toLowerCase()) {
        lastGenerated = candidate;
        return candidate;
      }
    }
    const fallback = `${ADJECTIVES[0]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`.slice(0, 16);
    lastGenerated = fallback;
    return fallback;
  }

  window.SkyNames = {
    ADJECTIVES,
    ANIMALS,
    generateName,
  };
})();

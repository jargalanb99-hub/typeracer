import { Sentence, RacerOption } from './types';

export const SENTENCES: Sentence[] = [
  // Easy paragraphs
  {
    id: 'e1',
    text: "The sun was shining brightly as the small sailboat glided across the peaceful lake. Gentle waves lapped against the wooden bow while a warm summer breeze filled the white sails. On the distant shore, tall pine trees swayed slowly against the clear blue sky. It was the kind of perfect afternoon where time seemed to slow down completely, allowing everyone to relax and simply enjoy the serene beauty of the natural world around them.",
    difficulty: 'easy',
    author: 'Summer Reflection',
    translation: 'A peaceful description of a sailboat on a sunny, calm lake surrounded by nature.'
  },
  {
    id: 'e2',
    text: "We decided to take a quiet walk through the neighborhood park just before sunset. Families were packing up their picnic blankets, children were playing on the grass, and a few friendly dogs chased tennis balls in the distance. The cool evening air smelled of fresh grass and damp earth, bringing a peaceful end to a very busy week. It is always important to step outside and appreciate these simple moments.",
    difficulty: 'easy',
    author: 'Evening Stroll',
    translation: 'A simple narrative describing a relaxing evening walk in a park at sunset.'
  },
  {
    id: 'e3',
    text: "Learning how to type fast is a great skill that will save you a lot of time in the future. If you practice for just fifteen minutes every single day, your fingers will start to remember where all the keys are without you even having to look down. This muscle memory is the key to building speed and typing accurately, so keep practicing and do not get discouraged when you make mistakes.",
    difficulty: 'easy',
    author: 'Typing Coach',
    translation: 'Practical advice about building muscle memory through consistent typing practice.'
  },

  // Medium paragraphs
  {
    id: 'm1',
    text: "The only way to do great work is to love what you do. If you have not found it yet, keep looking and do not settle. As with all matters of the heart, you will know it when you finally find it. Like any great relationship, it just gets better and better as the years roll on. So keep looking until you find the path that truly brings you joy, and never let anyone else define your success.",
    difficulty: 'medium',
    author: 'Steve Jobs',
    translation: 'Inspirational message about pursuing passion in one\'s career and never settling.'
  },
  {
    id: 'm2',
    text: "Success is not final, failure is not fatal: it is the courage to continue that counts in the end. Your present circumstances do not determine where you can go; they merely determine where you choose to start. If you can dream of a better future, you have the power to build it through hard work, determination, and a positive mindset. Always remember to keep your eyes on the stars and your feet flat on the ground.",
    difficulty: 'medium',
    author: 'Winston Churchill',
    translation: 'Classic encouraging thoughts on resilience, success, and setting steady goals.'
  },
  {
    id: 'm3',
    text: "Do not follow where the pre-existing path may lead you. Instead, find a spot where there is no path at all and leave your own unique trail. The greatest adventurers and thinkers in human history were those who dared to question standard beliefs and stepped boldly into the unknown. When you forge your own path, you inspire others to break free from their limitations and explore new possibilities.",
    difficulty: 'medium',
    author: 'Ralph Waldo Emerson',
    translation: 'A timeless quote on nonconformity, leadership, and creating your own destination.'
  },

  // Hard paragraphs
  {
    id: 'h1',
    text: "The advance of technology is based on making it fit in so seamlessly that you do not even really notice its presence, until it becomes an indispensable part of your everyday existence. In the modern era, the rapid proliferation of advanced computational intelligence has sparked widespread global discourse regarding its ultimate integration into our creative endeavors, highlighting the complex balance between automation and human ingenuity.",
    difficulty: 'hard',
    author: 'Mark Weiser',
    translation: 'An analytical observation on how seamless technology becomes invisible as it integrates into daily life.'
  },
  {
    id: 'h2',
    text: "To be, or not to be, that is the question: whether it is nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take up arms against a sea of troubles, and by opposing end them? To die, to sleep; to sleep, perchance to dream; ay, there is the rub; for in that sleep of death what dreams may come when we have shuffled off this mortal coil, must make us pause and reflect deeply on our journey.",
    difficulty: 'hard',
    author: 'William Shakespeare',
    translation: 'Hamlet\'s famous philosophical soliloquy on mortality, struggle, and the human condition.'
  },
  {
    id: 'h3',
    text: "The power of creative imagination is what truly makes humanity infinite, allowing us to transcend the severe physical and geographical limitations of our immediate environments. When we allow ourselves to think beyond the conventional boundaries of what is considered possible, we unlock a massive reservoir of innovation and discovery that has the potential to alter the entire trajectory of human civilization.",
    difficulty: 'hard',
    author: 'John Muir',
    translation: 'An eloquent essay segment celebrating the boundless possibilities unlocked by human imagination.'
  }
];

export const RACERS: RacerOption[] = [
  {
    type: 'car',
    emoji: '🏎️',
    name: 'Formula 1',
    color: 'from-red-500 to-red-700',
    speedMultiplier: 1.2
  },
  {
    type: 'horse',
    emoji: '🐎',
    name: 'Race Horse',
    color: 'from-amber-600 to-amber-800',
    speedMultiplier: 1.0
  },
  {
    type: 'rocket',
    emoji: '🚀',
    name: 'Cosmic Rocket',
    color: 'from-indigo-500 to-indigo-700',
    speedMultiplier: 1.25
  },
  {
    type: 'ufo',
    emoji: '🛸',
    name: 'Alien UFO',
    color: 'from-emerald-400 to-emerald-600',
    speedMultiplier: 1.15
  },
  {
    type: 'bicycle',
    emoji: '🚲',
    name: 'Mountain Bike',
    color: 'from-sky-500 to-sky-700',
    speedMultiplier: 0.9
  }
];

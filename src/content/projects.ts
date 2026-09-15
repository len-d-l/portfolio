export type ProjectSection = {
  heading?: string
  body: string
}

export type DeskKind =
  | 'piano'
  | 'ships'
  | 'bug'
  | 'spacecrew'
  | 'xingtian'
  | 'tomfoodery'
  | 'hub'
  | 'billboard'
  | 'ui'
  | 'unreal'

export type Project = {
  slug: string
  title: string
  year: string
  dateLabel: string
  type: string
  tools: string[]
  role: string
  desk?: DeskKind
  links?: { label: string; href: string }[]
  sections: ProjectSection[]
}

export const projects: Project[] = [
  {
    slug: 'bug-brigade',
    title: 'Bug Brigade',
    year: '2023–2024',
    dateLabel: 'April 2023 / May 2024',
    type: 'Game — 3D & programming',
    tools: ['Blender', 'Unity'],
    role: 'Characters, level, player movement, abilities, audio, animation',
    desk: 'bug',
    sections: [
      {
        heading: 'Art',
        body: 'Year-2 CMGT final: a cooperative browser game. I made the characters and the level. Models were built in Blender and textured with image maps. I was aiming for a PlayStation 1 / Nintendo 64 look — low-poly meshes, crunchy textures, and a PSX shader in Unity. The landscape was sculpted with Unity’s terrain tools.',
      },
      {
        heading: 'Programming',
        body: 'Later I wrote the player-movement script, the character abilities, and hooked up audio and animation. We planned multiplayer; I did not get it in, mostly through messy organisation and because it was my first time programming a full project instead of small mechanics on the side. Built in Unity.',
      },
    ],
  },
  {
    slug: 'unreal-project',
    title: 'Unreal Elective',
    year: '2024',
    dateLabel: 'March / April 2024',
    type: 'Programming',
    tools: ['Unreal Engine', 'Blueprints'],
    role: 'Gameplay, AI, level mechanics',
    desk: 'unreal',
    sections: [
      {
        body: 'A small game for my Unreal Engine elective — first time in Unreal after working more in Unity. I used Marketplace assets so I could stay on Blueprints. The mode is a timed target hunt: destroy every target before the clock runs out. The AI has several states and reacts to sight, sound, and damage. Around the level I also built medkits, doors that open by proximity, and light switches.',
      },
    ],
  },
  {
    slug: 'billboard',
    title: 'Billboard',
    year: '2024',
    dateLabel: 'May 2024',
    type: 'Graphic design',
    tools: ['Adobe Illustrator'],
    role: 'Poster design',
    desk: 'billboard',
    sections: [
      {
        body: 'A billboard poster for my father’s tattoo studio. He wanted the traditional Croatian dress my grandma is wearing, and the traditional Croatian tattoo motifs — some of which I added onto her hands. The point was to make people look, not to put a phone number on a street. No contact details or location, only the studio name.',
      },
    ],
  },
  {
    slug: 'digital-society-hub',
    title: 'Digital Society Hub',
    year: '2024',
    dateLabel: 'January 2024',
    type: '3D model',
    tools: ['Blender', 'Substance Painter'],
    role: 'Furniture / environment props',
    desk: 'hub',
    sections: [
      {
        body: 'Student video-game project: recreating a client headquarters in VR. I modelled the furniture from the real rooms in Blender and textured it in Substance Painter. First time I tried to rebuild a whole environment from life, accurately, in 3D.',
      },
    ],
  },
  {
    slug: 'spacecrew',
    title: 'SpaceCrew',
    year: '2023',
    dateLabel: 'November 2023',
    type: '3D model',
    tools: ['Blender', 'Substance Painter'],
    role: 'Props / environment models',
    desk: 'spacecrew',
    sections: [
      {
        body: 'Models for a student VR game about running a spaceship. I blocked them out in Blender from real-life reference and textured in Substance Painter. Some pieces never made it into the build, so a few stayed untextured.',
      },
    ],
  },
  {
    slug: 'ui-redesign',
    title: 'UI / UX Redesign',
    year: '2023',
    dateLabel: 'March / April 2023',
    type: 'Graphic design',
    tools: ['Figma'],
    role: 'UI redesign',
    desk: 'ui',
    links: [
      {
        label: 'Idle Koi Fish — Zen Pond',
        href: 'https://play.google.com/store/apps/details?id=com.vaak.koifishidle&hl=en_US',
      },
    ],
    sections: [
      {
        body: 'School brief: redesign the UI of an existing game. I chose Idle Koi Fish — Zen Pond and rebuilt the interface in Figma.',
      },
    ],
  },
  {
    slug: 'nightmare-of-xingtian',
    title: 'The Nightmare of Xingtian',
    year: '2023',
    dateLabel: 'January 2023',
    type: 'Pixel art',
    tools: ['Aseprite', 'GameMaker'],
    role: 'Tilesets, layouts, main character',
    desk: 'xingtian',
    sections: [
      {
        body: 'Pixel art for a student project rooted in Chinese culture. I made the tilesets, level layouts, and the main character in Aseprite, then brought them into GameMaker, where the game was built.',
      },
    ],
  },
  {
    slug: 'tomfoodery',
    title: 'Tomfoodery',
    year: '2022',
    dateLabel: 'November 2022',
    type: 'Board game',
    tools: ['Illustration', 'Laser cutting'],
    role: 'Croatian dish cards, ingredient cards, restaurant cards, tokens',
    desk: 'tomfoodery',
    sections: [
      {
        body: 'First project after starting CMGT. The brief was a board game with intercultural competencies — it had to be culturally diverse. We made a game about food from four countries. I designed the Croatian dishes, the ingredient cards, and the restaurant cards (another teammate drew on the restaurant cards). I also laser-cut the tokens from a teammate’s design.',
      },
    ],
  },
  {
    slug: 'low-poly-ships',
    title: 'Low Poly Ships',
    year: '2022',
    dateLabel: 'May 2022',
    type: '3D model',
    tools: ['Blender', 'Substance Painter'],
    role: '3D art',
    desk: 'ships',
    links: [
      {
        label: 'The Dead Dance Again on itch.io',
        href: 'https://georgikarev.itch.io/the-dead-dance-again',
      },
    ],
    sections: [
      {
        body: 'Low-poly takes on the Flying Dutchman and the HMS Endeavour, built in Blender from reference of their real counterparts (the Dutch fluyt Derfflinger and the English HMS Endeavour). Textures were hand-painted in Substance Painter. They went into a student game published on itch.io.',
      },
    ],
  },
  {
    slug: 'piano',
    title: 'Piano',
    year: '2022',
    dateLabel: 'April / May 2022',
    type: '3D model',
    tools: ['3ds Max', 'Photoshop'],
    role: 'Model & textures',
    desk: 'piano',
    sections: [
      {
        body: 'A 3D version of my own piano, built in 3ds Max from the instrument and drawings I made of it. It was an intake assignment for Breda University of Applied Sciences, and it got me in. One of the first 3D models I ever made. PBR materials from textures.com, plus hand-drawn interface textures in Photoshop and stickers from reference photos.',
      },
    ],
  },
]

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug)
}

export function deskProjects(): Project[] {
  return projects.filter((project) => project.desk)
}

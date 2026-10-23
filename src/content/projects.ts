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
  | 'umcg-cave'

export type Discipline = '3D' | 'Programming' | 'Design' | '2D art'

export const disciplines: Discipline[] = ['3D', 'Programming', 'Design', '2D art']

/** A file in public/projects/{slug}. The title shows under the image in the full-screen view. */
export type ProjectImage = { file: string; title?: string }

export type Project = {
  slug: string
  title: string
  year: string
  dateLabel: string
  type: string
  tools: string[]
  role: string
  disciplines: Discipline[]
  desk?: DeskKind
  links?: { label: string; href: string }[]
  sections: ProjectSection[]
  /** In display order; the first one is the cover on the Work page. */
  images: ProjectImage[]
  /** Replaces the image collage on the project page when set. */
  video?: string
}

export const projects: Project[] = [
  {
    slug: 'umcg-cave',
    title: 'UMCG CAVE',
    year: '2025–2026',
    dateLabel: 'February 2025 / 2026',
    type: 'Research tools — programming & 3D',
    tools: ['Unity', 'C#', 'Vicon Nexus', 'Blender', 'ZBrush', 'Node.js'],
    role: 'Playback tools, a browser control panel, motion-capture avatars, and a CAVE kitchen',
    desk: 'umcg-cave',
    disciplines: ['3D', 'Programming'],
    images: [
      { file: 'cover.jpg', title: 'The CAVE' },
      { file: '2.jpg', title: 'Avatar, from blockout to sculpt' },
      { file: '3.jpg', title: 'Sculpt and the mesh that runs in Unity' },
      { file: '4.jpg', title: 'Female avatar' },
      { file: '5.jpg', title: 'Control panel' },
    ],
    sections: [
      {
        heading: 'The lab',
        body: 'I spent my internship and my graduation at UMCG Human Movement Sciences, in the same lab and on the same system: a four-wall CAVE driven by Vicon motion capture. Researchers use it to study how people move. The tools were already there, but they were hard to change unless you already knew Unity. My job was to make them usable.',
      },
      {
        heading: 'Internship',
        body: 'The playback tool could only scrub a timeline. I added play, pause, reset and frame stepping, and fixed a bug where recorded movement lost the Z axis. Driving the scene from inside the room does not work, and multiplayer was a poor fit, so I built a Node.js site that talks to Unity over a websocket. Researchers start a recording, calibrate, and change Vicon settings from a browser. A cloud of markers is hard to read, so I modelled a male and a female body in Blender, sculpted them in ZBrush, retopologised them so they would run in the lab project, and rigged them to the captured markers. The room already worked with Vicon Tracker. Nexus, which the researchers need for kinematic data, does not send segment position and rotation into Unity. I wrote to Vicon about it, and in parallel built a workaround that reconstructs a segment from the markers already in the scene. That unblocked head tracking.',
      },
      {
        heading: 'Graduation',
        body: 'The department already had a VR kitchen, made with Leap Motion, for tasks like reaching and grasping. For my graduation I redesigned it for the CAVE and for Vicon. Participants with limited upper-body mobility can practise real actions in a space that does not load the body, and researchers get accurate full-body data while they do it. This project received the CMGT Graduation Award.',
      },
    ],
  },
  {
    slug: 'bug-brigade',
    title: 'Bug Brigade',
    year: '2023–2024',
    dateLabel: 'April 2023 / May 2024',
    type: 'Game — 3D & programming',
    tools: ['Blender', 'Unity'],
    role: 'Characters, level, player movement, abilities, audio, animation',
    desk: 'bug',
    disciplines: ['3D', 'Programming'],
    images: [
      { file: 'cover.jpg' },
      { file: '1.jpg' },
      { file: '2.jpg' },
      { file: '3.jpg' },
      { file: '4.jpg' },
      { file: '5.jpg' },
      { file: '6.jpg' },
      { file: '7.jpg' },
      { file: '8.jpg' },
      { file: '9.jpg' },
      { file: '10.jpg' },
      { file: '11.jpg' },
      { file: '12.jpg' },
      { file: '13.jpg' },
    ],
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
    disciplines: ['Programming'],
    images: [{ file: 'cover.jpg' }],
    video: 'showcase.mp4',
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
    disciplines: ['Design'],
    images: [{ file: 'cover.jpg' }],
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
    disciplines: ['3D'],
    images: [{ file: 'cover.jpg' }, { file: '1.jpg' }, { file: '2.jpg' }, { file: '3.jpg' }, { file: '4.jpg' }],
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
    disciplines: ['3D'],
    images: [
      { file: 'cover.jpg' },
      { file: '1.jpg' },
      { file: '2.jpg' },
      { file: '3.jpg' },
      { file: '4.jpg' },
      { file: '5.jpg' },
      { file: '6.jpg' },
      { file: '7.jpg' },
      { file: '8.jpg' },
      { file: '9.jpg' },
    ],
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
    disciplines: ['Design'],
    images: [{ file: 'cover.jpg' }, { file: '1.jpg' }, { file: '2.jpg' }, { file: '3.jpg' }],
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
    disciplines: ['2D art'],
    images: [
      { file: 'cover.jpg' },
      { file: '1.jpg' },
      { file: '2.jpg' },
      { file: '3.jpg' },
      { file: '4.jpg' },
      { file: '5.jpg' },
      { file: '6.jpg' },
      { file: '7.jpg' },
      { file: '8.jpg' },
    ],
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
    disciplines: ['Design', '2D art'],
    images: [
      { file: 'cover.jpg' },
      { file: '1.jpg' },
      { file: '2.jpg' },
      { file: '3.jpg' },
      { file: '4.jpg' },
      { file: '5.jpg' },
      { file: '6.jpg' },
    ],
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
    disciplines: ['3D'],
    images: [{ file: 'cover.jpg' }, { file: '1.jpg' }, { file: '2.jpg' }, { file: '3.jpg' }, { file: '4.jpg' }, { file: '5.jpg' }],
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
    disciplines: ['3D'],
    images: [
      { file: 'cover.jpg' },
      { file: '1.jpg' },
      { file: '2.jpg' },
      { file: '3.jpg' },
      { file: '4.jpg' },
      { file: '5.jpg' },
      { file: '6.jpg' },
      { file: '7.jpg' },
      { file: '8.jpg' },
      { file: '9.jpg' },
      { file: '10.jpg' },
      { file: '11.jpg', title: 'Wireframe' },
      { file: '12.jpg', title: 'Materials' },
      { file: '13.jpg', title: 'Texture board' },
      { file: '14.jpg', title: 'Sketches of the real piano' },
    ],
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

export function mediaUrl(project: Project, file: string) {
  return `${import.meta.env.BASE_URL}projects/${project.slug}/${file}`
}
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

export function projectYear(project: Project) {
  return Math.max(...(project.year.match(/\d{4}/g)?.map(Number) ?? [0]))
}

function endStamp(project: Project) {
  const last = [...project.dateLabel.matchAll(/([A-Za-z]+)\s+(\d{4})/g)].at(-1)
  if (!last) return projectYear(project) * 12
  const month = months.indexOf(last[1].toLowerCase()) + 1 || 6
  return Number(last[2]) * 12 + month
}

export function projectsNewestFirst(): Project[] {
  return [...projects].sort((a, b) => endStamp(b) - endStamp(a))
}

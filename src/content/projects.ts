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
  | 'agricultural-drone'

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
  /** In display order; the first one is the cover on the Work page. Dev arrange mode can override this from order.json. */
  images: ProjectImage[]
  /** Replaces the image collage on the project page when set. */
  video?: string
  /** Playable clips shown with the stills. */
  videos?: ProjectImage[]
}

export const projects: Project[] = [
  {
    slug: 'agricultural-drone',
    title: 'Agricultural Drone (IWP)',
    year: '2025–2026',
    dateLabel: 'September 2025 / January 2026',
    type: 'Simulation tools',
    tools: ['Python', 'Lua', 'BeamNG.tech', 'Figma', 'Substance 3D Designer', 'Blender'],
    role: 'Procedural terrain, the heightmap app, and the ground around it',
    disciplines: ['Programming', '3D', 'Design'],
    desk: 'agricultural-drone',
    images: [
      { file: 'cover.jpg', title: 'High fidelity' },
      { file: 'low.jpg', title: 'Low fidelity' },
      { file: 'mid.jpg', title: 'Mid fidelity' },
      { file: '1.jpg', title: 'The working app' },
      { file: '2.jpg', title: 'Applying it in BeamNG' },
    ],
    videos: [
      { file: 'dirt.mp4', title: 'Dirt material' },
      { file: 'trees.mp4', title: 'Procedural trees' },
      { file: 'contribution.mp4', title: 'Project contribution' },
    ],
    sections: [
      {
        body: 'This was an Innovation Workplace (IWP) group project for a client who wanted to test an autonomous agricultural drone in BeamNG.tech, a vehicle simulation environment. I was responsible for the terrain generation tools and the procedural assets used to bring the environment to life.',
      },
      {
        heading: 'Heightmap Generation',
        body: 'BeamNG.tech uses heightmaps to define terrain elevation, so I developed a Python application to generate them. Users can select a level and terrain type, then adjust parameters such as ploughed-row spacing, sharpness, noise, and the transition between fields and hills. A live preview lets them check the result before exporting the heightmap as a PNG.',
      },
      {
        body: 'I also created a Lua tool for the BeamNG editor to apply the generated heightmaps to the terrain, with controls for meters per pixel and height scale, as well as support for saving presets. Both Python and Lua were new to me, and learning to work with BeamNG.tech meant iterating on the tools until the workflow and parameters were right.',
      },
      {
        heading: 'UI & Procedural Assets',
        body: 'I redesigned the heightmap generator\'s interface in Figma, keeping its functionality while making the controls easier to navigate. To give the generated terrain more visual detail, I created procedural dirt and tree-bark materials in Substance 3D Designer, along with a procedural tree-generation system in Blender.',
      },
      {
        body: 'Through this project, I gained experience building custom tools across different technologies and combining procedural workflows to create more flexible game environments.',
      },
    ],
  },
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
      { file: '6.jpg', title: 'The tracking space' },
      { file: '7.jpg', title: 'Kitchen in Blender' },
      { file: '8.jpg', title: 'Oven, hob, and fridge' },
      { file: '9.jpg', title: 'Kitchen in Unity' },
      { file: '10.jpg', title: 'Hand markers' },
      { file: '11.jpg', title: 'Marker glove' },
      { file: '12.jpg', title: 'Marker setup' },
      { file: '13.jpg', title: 'Live tracking in Nexus' },
    ],
    videos: [
      { file: 'playthrough.mp4', title: 'Project playthrough' },
      { file: 'bread.mp4', title: 'Bread slicing' },
      { file: 'soup.mp4', title: 'Soup scooping' },
      { file: 'grasp.mp4', title: 'Early grasp test' },
    ],
    sections: [
      {
        body: 'I completed both my internship and graduation project at the Human Movement Sciences department of the University Medical Center Groningen (UMCG). I worked with a four-wall CAVE driven by Vicon motion capture, developing tools to make the system more accessible to researchers and expanding its capabilities for studying human movement.',
      },
      {
        heading: 'Internship',
        body: 'During my internship, I improved the existing motion-capture tools by adding playback controls and fixing a bug that caused recorded movement to lose its Z-axis data. I also built a browser-based control interface using Node.js and WebSockets, allowing researchers to manage recordings, calibration, and Vicon settings without interacting with Unity directly.',
      },
      {
        body: 'To make captured movement easier to interpret, I created and rigged male and female 3D body models using Blender and ZBrush. I also developed a workaround to reconstruct segment position and orientation from motion-capture markers, enabling head tracking using data that was not directly available from the existing Vicon Nexus integration.',
      },
      {
        heading: 'Graduation Project',
        body: 'For my graduation project, I adapted an existing VR kitchen application from Leap Motion to the CAVE and Vicon setup. The application allows participants to perform everyday kitchen tasks while researchers capture their upper-body movements.',
      },
      {
        body: 'I developed interactions and task systems for activities such as preparing soup and grilled cheese, setting the table, and reaching overhead. I also worked on integrating the application with the motion-capture pipeline to support reliable movement data collection.',
      },
      {
        body: 'The project received the CMGT Graduation Award at Hanze University of Applied Sciences.',
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
    videos: [{ file: 'abilities.mp4', title: 'Ability showcase' }],
    sections: [
      {
        heading: 'Art',
        body: 'Bug Brigade was our final project in the second year of CMGT: a cooperative browser game. I created the characters and the level, modelling the assets in Blender and texturing them with image-based textures.',
      },
      {
        body: 'I wanted to recreate the look of games from the PlayStation 1 and Nintendo 64 era, using low-poly models, pixelated textures, and a PSX shader in Unity. I also built the landscape using Unity\'s terrain tools to bring the environment together and match the game\'s retro style.',
      },
      {
        heading: 'Programming',
        body: 'Alongside creating the art and environment, I also worked on the game\'s gameplay systems in Unity. I wrote the player movement script, implemented the characters\' abilities, and integrated the audio and animations.',
      },
      {
        body: 'We originally planned to include multiplayer, as the game was designed around cooperative play, but I wasn\'t able to get it working within the project. It was an important learning experience in balancing technical ambition with the time available, especially as I was still getting used to programming for a larger game rather than just building smaller mechanics on their own.',
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
        body: 'This was a small game I made for my Unreal Engine elective and my first time working with Unreal Engine. Coming from Unity, it was interesting to learn a different engine and its approach to game development. I enjoyed the experience and was happy with what I managed to build.',
      },
      {
        body: 'I used free assets from the Unreal Marketplace to put together the environment, allowing me to focus on programming with Blueprints. The main objective was to destroy all the targets before the timer ran out. To support this, I created an AI system with multiple states that could react to sight, sound, and damage.',
      },
      {
        body: 'I also added smaller interactions throughout the level, including medkits, proximity-activated doors, and light switches. Together, these mechanics gave me the chance to explore different gameplay systems and get hands-on experience with Unreal\'s visual scripting tools.',
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
        body: 'I designed this billboard for my father\'s tattoo studio in Adobe Illustrator. The idea was to draw attention to traditional Croatian culture by featuring my grandmother wearing traditional Croatian dress, alongside traditional Croatian tattoo motifs. I also added some of these motifs to her hands to connect the imagery with the studio\'s work.',
      },
      {
        body: 'Rather than functioning as a conventional advertisement, the billboard was meant to catch people\'s attention and spark their curiosity. For that reason, I kept the design simple, leaving only the studio\'s name and letting the imagery speak for itself.',
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
        body: 'For this student VR project, our team recreated the client\'s headquarters as a virtual environment. I was responsible for modelling the furniture based on its real-life counterparts, using Blender to recreate the objects and Substance 3D Painter to texture them.',
      },
      {
        body: 'This was my first time recreating a real environment with a focus on accuracy, rather than designing something from scratch. It challenged me to pay closer attention to the details, shapes, and proportions of everyday objects to make their virtual versions resemble the originals.',
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
        body: 'SpaceCrew was a student VR game about managing a spaceship. I created 3D models for the project in Blender, using real-life reference images to guide the modelling, and textured them in Substance 3D Painter.',
      },
      {
        body: 'Not all of the models ended up being used in the final game, so some remained untextured. Even so, the project gave me experience creating 3D assets for a VR game and working with references to bring objects into a game environment.',
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
        body: 'For this school project, I was tasked with redesigning the user interface of an existing game. I chose Idle Koi Fish: Zen Pond and created a new interface design in Figma.',
      },
      {
        body: 'I reworked the layout, visual style, and interface elements to create a more cohesive experience, while keeping the game\'s calm, relaxing atmosphere in mind. This meant looking at how menus, buttons, icons, and in-game information fit together, rather than treating each element as a separate design.',
      },
      {
        body: 'The project gave me the opportunity to explore how small design decisions can influence the overall feel of a game and how its interface can support the experience without distracting from it.',
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
        body: 'Nightmare of XingTian was a student project inspired by Chinese culture. I was responsible for creating the game\'s pixel art, including the tilesets, level layouts, and main character.',
      },
      {
        body: 'I created the assets in Aseprite and then imported them into GameMaker, where the game was developed. It was a great opportunity to experiment with pixel art and level design while helping to bring the game\'s world and characters to life.',
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
        body: 'Tomfoodery was my first project in Creative Media & Game Technologies. The brief was to create a board game that explored intercultural competencies, encouraging players to engage with different cultures through a shared experience.',
      },
      {
        body: 'Our team developed a food-themed game featuring dishes from four different countries. My contributions focused on the visual design of the Croatian dishes, ingredient cards, and restaurant cards. I also helped bring the game into the physical world by laser-cutting the game tokens using a design created by a teammate.',
      },
      {
        body: 'The project introduced me to collaborative design and the process of translating a concept into a tangible, playable experience.',
      },
    ],
  },
  {
    slug: 'low-poly-ships',
    title: 'Low Poly Ships',
    year: '2023',
    dateLabel: 'May 2023',
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
        body: 'For a student game project, I created low-poly versions of the Flying Dutchman and HMS Endeavour in Blender, using references of their real-world counterparts: the Dutch fluyt Derfflinger and the English ship Endeavour.',
      },
      {
        body: 'I modelled both ships with a low-poly style in mind, then hand-painted their textures in Adobe Substance 3D Painter to give each vessel its own look while keeping them consistent with the game\'s visual style.',
      },
      {
        body: 'The ships were used in The Dead Dance Again, a student game published on itch.io.',
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
        body: 'This project was one of my first experiences with 3D modelling. Using my own piano and hand-drawn sketches as references, I recreated the instrument in 3ds Max as part of an intake assignment for Breda University of Applied Sciences, which helped me earn a place at the university.',
      },
      {
        body: 'For texturing, I combined free PBR materials from Textures.com with custom hand-drawn textures created in Photoshop for the piano\'s interface. I also used reference photographs to recreate the stickers, combining different texturing approaches to capture the details of the original instrument.',
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
  let year = Number(last[2])
  let month = months.indexOf(last[1].toLowerCase()) + 1 || 6
  // "February 2025 / 2026" keeps going through the later year.
  const openYear = project.dateLabel.match(/\/\s*(\d{4})\s*$/)
  if (openYear && Number(openYear[1]) > year) {
    year = Number(openYear[1])
    month = 12
  }
  return year * 12 + month
}

export function projectsNewestFirst(): Project[] {
  return [...projects].sort((a, b) => endStamp(b) - endStamp(a))
}

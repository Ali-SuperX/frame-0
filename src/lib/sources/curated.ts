import type { DiscoverCategory, DiscoverItem } from "./types";

/**
 * Heuristic category tagger — matches common keywords in the prompt/title to
 * assign one or more DiscoverCategory tags. Not perfect but good enough for
 * the filter chips; manually add `categories` to specific entries to override.
 */
function inferCategories(text: string): DiscoverCategory[] {
  const t = text.toLowerCase();
  const tags = new Set<DiscoverCategory>();
  const match = (re: RegExp, cat: DiscoverCategory) => {
    if (re.test(t) || re.test(text)) tags.add(cat);
  };
  match(/cinematic|anamorphic|35mm|film grain|anamorph|depth of field|bokeh|电影|胶片|镜头/, "cinematic");
  match(/portrait|close.?up|woman|man|face|person|smile|eyes|hair|肖像|特写|人物/, "portrait");
  match(/animat|anime|ghibli|claymation|stop.?motion|3d|isometric|doodle|stylized|动画/, "animation");
  match(/forest|mountain|ocean|sea|beach|desert|field|sunset|sunrise|coral|jungle|alps|aerial|drone|landscape|风景|山|海|森林|沙丘/, "landscape");
  match(/multi.?shot|narrative|story|scene|sequence|montage|cafe|market|detective|叙事|故事|多镜头/, "narrative");
  match(/liminal|experimental|abstract|bloom|split.?diopter|macro|slow.?motion|实验|超/, "experimental");
  match(/runway|walk|couture|fashion|skateboard|commercial|brand|tasting|watch|商业|时装/, "commercial");
  if (tags.size === 0) tags.add("cinematic");
  return [...tags];
}

/**
 * Hand-curated catalog of notable text-to-video prompts from official sources.
 * Each entry links back to the original post / page for attribution — we don't
 * host the videos ourselves; clicking "Open source" opens the original.
 *
 * To extend: add another object below. `sourceUrl` is required so users can
 * verify provenance. `bg` is a CSS gradient used as a thumbnail placeholder.
 */

type CuratedRaw = {
  id: string;
  title: string;
  prompt: string;
  modelLabel: string;
  sourceUrl: string;
  author?: string;
  bg: string;
  aspectRatio?: string;
  /** 手动覆盖自动分类（见文件头注释）。 */
  categories?: string[];
};

const CURATED: CuratedRaw[] = [
  /* ── Sora (OpenAI) ── */
  {
    id: "sora-woman-tokyo",
    title: "Tokyo woman in neon alley",
    prompt:
      "A stylish woman walks down a Tokyo street filled with warm glowing neon and animated city signage. She wears a black leather jacket, a long red dress, and black boots, and carries a black purse. She wears sunglasses and red lipstick. She walks confidently and casually. The street is damp and reflective, creating a mirror effect of the colorful lights. Many pedestrians walk about.",
    modelLabel: "Sora",
    sourceUrl: "https://openai.com/index/sora/",
    author: "OpenAI",
    bg: "linear-gradient(160deg, #120828 0%, #4a1030 45%, #d4305c 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "sora-mammoths",
    title: "Woolly mammoths, snowfield",
    prompt:
      "Several giant wooly mammoths approach treading through a snowy meadow, their long wooly fur lightly blows in the wind as they walk, snow covered trees and dramatic snow capped mountains in the distance, mid afternoon light with wispy clouds and a sun high in the distance creates a warm glow.",
    modelLabel: "Sora",
    sourceUrl: "https://openai.com/index/sora/",
    author: "OpenAI",
    bg: "linear-gradient(180deg, #c8dce8 0%, #7a8a9a 60%, #2a2a3a 100%)",
    aspectRatio: "16:9",
  },

  /* ── Veo 3 (Google DeepMind) ── */
  {
    id: "veo3-horse-beach",
    title: "Galloping horse on beach",
    prompt:
      "A horse gallops along an empty beach at sunset, hooves splashing through the shallow water, slow-motion spray catching the golden light, wide cinematic shot with warm bokeh, 35mm anamorphic.",
    modelLabel: "Veo 3",
    sourceUrl: "https://deepmind.google/technologies/veo/",
    author: "Google DeepMind",
    bg: "linear-gradient(180deg, #f0a060 0%, #c05030 50%, #2a1a1a 100%)",
    aspectRatio: "16:9",
  },

  /* ── Kling 2.x (Kuaishou) ── */
  {
    id: "kling-2-swan",
    title: "Swan on misty lake",
    prompt:
      "Close-up on a single white swan gliding across a misty alpine lake at dawn. Soft pastel sky, reflections perfectly symmetric on glassy water, gentle ripples trail behind. Minimal cinematography, patient pacing, natural ambient sound.",
    modelLabel: "Kling 2.0 Pro",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(180deg, #e8dcc8 0%, #b0a090 50%, #3a4050 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "kling-2-dragon",
    title: "Dragon above mountains",
    prompt:
      "Epic wide shot: an enormous red-scaled dragon glides between cloud layers above jagged Himalayan peaks, sunlight refracting through its translucent wings, camera orbits 180° in a slow arc, massive scale emphasized by tiny birds below.",
    modelLabel: "Kling 2.0 Pro",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(160deg, #3a1818 0%, #8a2a30 45%, #d8a048 100%)",
    aspectRatio: "16:9",
  },

  /* ── Seedance 2.0 (ByteDance / Doubao) ── */
  {
    id: "seedance2-youth-romance",
    title: "日系纯爱",
    prompt:
      "15秒唯美纯爱叙事镜头，电影级写实画质，2.35:1画幅。0-4秒：暖黄色调，午后阳光透过百叶窗洒在木质书桌上，形成细微的丁达尔效应，少女趴在桌上浅睡，微风吹动她耳边的碎发和书页，镜头极缓推向侧脸特写；5-10秒：镜头切换至对面坐着的少年，他正出神地看着少女，眼神清澈溢满温柔，发现少女睫毛微动，立刻慌乱地低头假装看书，指尖局促地揉搓书角；11-15秒：大特写两人目光撞在一起的瞬间，少女羞涩抿嘴，少年露出腼腆笑容，背景虚化成梦幻的光斑，音效是轻微的蝉鸣和翻书声。禁止出现任何水印、字幕、文字。",
    modelLabel: "Seedance 2.0",
    sourceUrl: "https://x.com/LufzzLiz/status/2029817696448303419",
    author: "@LufzzLiz",
    bg: "linear-gradient(160deg, #1a1008 0%, #5c3510 45%, #e8a830 100%)",
    aspectRatio: "16:9",
    categories: ["narrative", "cinematic", "portrait"],
  },
  {
    id: "seedance2-street",
    title: "Urban runner, rainy neon",
    prompt:
      "一位身穿黑色连帽衫的年轻跑者在雨夜的城市街道上奔跑，霓虹招牌在湿润的路面上折射出斑斓色块，镜头跟拍半身，慢动作，25mm 宽角，电影感。",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    author: "ByteDance",
    bg: "linear-gradient(180deg, #0a1028 0%, #3a2070 45%, #d060e0 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "seedance2-cinema",
    title: "Panda on moped, Shanghai",
    prompt:
      "A giant panda wearing a black leather jacket rides a tiny moped through a rainy Shanghai alley at night, practical neon lighting, steam rising from gutters, cinematic depth of field, 35mm film grain, shot handheld.",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    author: "ByteDance",
    bg: "linear-gradient(140deg, #281010 0%, #604030 55%, #e08060 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "seedance2-ocean",
    title: "Slow-motion whale breach",
    prompt:
      "Slow motion shot of a humpback whale breaching out of a calm ocean at golden hour, water cascading in translucent sheets, flock of seagulls scatters, extreme telephoto compression, cinematic anamorphic wide screen.",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    author: "ByteDance",
    bg: "linear-gradient(180deg, #142a3a 0%, #3a6090 50%, #f0c060 100%)",
    aspectRatio: "16:9",
  },

  /* ── Runway Gen-3 / Gen-4 ── */
  {
    id: "runway-g3-train",
    title: "Steam train in forest",
    prompt:
      "An old steam locomotive winds through a misty forest at dawn, shafts of warm light cutting through tall evergreens, smoke trails into the canopy, tracking shot from the side following the locomotive for 6 seconds.",
    modelLabel: "Runway Gen-3 Alpha",
    sourceUrl: "https://runwayml.com/research/introducing-gen-3-alpha",
    author: "Runway",
    bg: "linear-gradient(160deg, #0c1a0c 0%, #3a5030 50%, #a08040 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "runway-g4-portrait",
    title: "Portrait, morning window",
    prompt:
      "A young woman sits by a window in a sunlit cafe, reading a paperback, steam rising from a coffee cup. Camera slowly pushes in on her face as she looks up and smiles softly. Natural window light, shallow depth of field, 85mm.",
    modelLabel: "Runway Gen-4",
    sourceUrl: "https://runwayml.com/",
    author: "Runway",
    bg: "linear-gradient(180deg, #e8c090 0%, #a06040 55%, #2a1808 100%)",
    aspectRatio: "9:16",
  },

  /* ── Pika v2 ── */
  {
    id: "pika-2-confetti",
    title: "Confetti explosion",
    prompt:
      "A slow-motion confetti cannon explosion captured head-on in a dark room, paper and foil bits fill frame like galaxies, individual specks catch rim light, 120fps, 50mm lens.",
    modelLabel: "Pika 2.0",
    sourceUrl: "https://pika.art/",
    author: "Pika Labs",
    bg: "linear-gradient(180deg, #0c0c18 0%, #4030c0 50%, #d0b030 100%)",
    aspectRatio: "1:1",
  },

  /* ── Wan 2.2 / 2.7 (Aliyun) ── */
  {
    id: "wan27-kitchen",
    title: "Dough-shaping hands",
    prompt:
      "两只手在撒了面粉的台面上揉制面团，近景特写，自然侧逆光，阳光从窗户斜射进来尘埃颗粒可见，45度仰角，柔和电影色调，慢镜头。",
    modelLabel: "Wan 2.7",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(160deg, #f0e0c0 0%, #c09060 50%, #502a18 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "wan27-desert",
    title: "Lone traveler, sand dunes",
    prompt:
      "A hooded traveler crosses endless golden dunes at sunset, camera follows from high aerial angle, drifting shadow elongates across the sand, small footprints trail behind, wind whips fabric.",
    modelLabel: "Wan 2.7",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(180deg, #fda85a 0%, #e06028 50%, #2a1010 100%)",
    aspectRatio: "16:9",
  },

  /* ── Luma Dream Machine ── */
  {
    id: "luma-ballerina",
    title: "Ballerina in studio",
    prompt:
      "A ballerina performs a slow pirouette in an empty sunlit dance studio, dust particles float in the light shafts from tall windows, wooden floor, camera orbits her at hip height.",
    modelLabel: "Luma Dream Machine",
    sourceUrl: "https://lumalabs.ai/dream-machine",
    author: "Luma AI",
    bg: "linear-gradient(180deg, #f0e0e0 0%, #c08080 55%, #4a1e1e 100%)",
    aspectRatio: "9:16",
  },

  /* ── Hailuo (MiniMax) ── */
  {
    id: "hailuo-koi",
    title: "Koi fish pond",
    prompt:
      "Overhead shot of a traditional Japanese koi pond, orange and white koi glide in slow circles, fallen maple leaves drift on the surface, water is crystal clear showing pebbled bottom, golden hour light.",
    modelLabel: "Hailuo AI",
    sourceUrl: "https://hailuoai.video/",
    author: "MiniMax",
    bg: "linear-gradient(180deg, #e08040 0%, #c04020 50%, #102040 100%)",
    aspectRatio: "16:9",
  },

  /* ── PixVerse ── */
  {
    id: "pixverse-coffee",
    title: "Coffee pour, macro",
    prompt:
      "Macro close-up of coffee being poured into a white porcelain cup, liquid glossy and viscous, surface crema forming, backlit with warm morning light, 100mm macro lens.",
    modelLabel: "PixVerse v4",
    sourceUrl: "https://pixverse.ai/",
    bg: "linear-gradient(160deg, #3a1a08 0%, #8a4020 55%, #e0b080 100%)",
    aspectRatio: "16:9",
  },

  /* ── Community classics ── */
  {
    id: "studio-ghibli-forest",
    title: "Ghibli-style forest spirit",
    prompt:
      "A small round forest spirit with big eyes peeks out from behind a moss-covered tree in a lush rainforest, dappled sunlight, Studio Ghibli animation style, gentle wind, hand-drawn texture.",
    modelLabel: "Kling 2.0",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(160deg, #1a3a20 0%, #60a050 55%, #e8f0a0 100%)",
    aspectRatio: "1:1",
  },

  /* ── Sora (extended) ── */
  {
    id: "sora-paper-airplane",
    title: "Paper airplane on ancient ruins",
    prompt:
      "Aerial shot tracking a paper airplane made of old newspaper gliding over the ruins of an ancient temple at golden hour, weaving between crumbling columns, camera chasing in slow motion, shallow depth of field.",
    modelLabel: "Sora",
    sourceUrl: "https://openai.com/index/sora/",
    author: "OpenAI",
    bg: "linear-gradient(160deg, #1a1408 0%, #6a4020 45%, #e8a860 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "sora-underwater",
    title: "Underwater coral festival",
    prompt:
      "A large pod of clownfish swims through a coral reef that is lit like a festival, each coral pulsing a different bioluminescent color, the fish react in unison to a passing school of sardines. Shot as if from an IMAX documentary.",
    modelLabel: "Sora",
    sourceUrl: "https://openai.com/index/sora/",
    author: "OpenAI",
    bg: "linear-gradient(180deg, #052045 0%, #1a5090 55%, #d0e0f0 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "sora-coffee-monster",
    title: "Monster emerges from espresso",
    prompt:
      "Close-up macro shot of a fluffy little crab-like monster emerging from a cup of espresso and waving hello at the camera, morning kitchen setting, natural window light, 100mm macro lens.",
    modelLabel: "Sora",
    sourceUrl: "https://openai.com/index/sora/",
    author: "OpenAI",
    bg: "linear-gradient(160deg, #2a1808 0%, #7a4020 55%, #e8b060 100%)",
    aspectRatio: "1:1",
  },

  /* ── Veo 3 (extended) ── */
  {
    id: "veo3-fashion-runway",
    title: "Couture on rain-slick runway",
    prompt:
      "A model walks a rain-slick runway at night wearing a flowing black gown that catches the wind. Dramatic side lighting, slow motion, rain drops visible on her shoulders, dozens of camera flashes strobe from the audience.",
    modelLabel: "Veo 3",
    sourceUrl: "https://deepmind.google/technologies/veo/",
    author: "Google DeepMind",
    bg: "linear-gradient(160deg, #0a0a0a 0%, #3a3a3a 55%, #c0a060 100%)",
    aspectRatio: "9:16",
  },
  {
    id: "veo3-skateboard",
    title: "Kickflip, concrete skate park",
    prompt:
      "Low wide shot of a skateboarder nailing a kickflip over a concrete bench at a sun-bleached urban skate park, debris flies up, the board spins one perfect rotation, mid-flight freeze at apex, dust particles catch the light.",
    modelLabel: "Veo 3",
    sourceUrl: "https://deepmind.google/technologies/veo/",
    author: "Google DeepMind",
    bg: "linear-gradient(180deg, #a88860 0%, #604030 55%, #1a1210 100%)",
    aspectRatio: "16:9",
  },

  /* ── Kling (extended) ── */
  {
    id: "kling-elephant",
    title: "Elephant in the rain",
    prompt:
      "A lone elephant walks through a tropical rain shower in slow motion, droplets cling to long eyelashes, dust turns to mud at its feet, ambient jungle sounds, anamorphic widescreen, cinematic color grade.",
    modelLabel: "Kling 2.0 Pro",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(180deg, #3a4a2a 0%, #6a6050 55%, #b09060 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "kling-chef",
    title: "Chef plating tasting menu",
    prompt:
      "Top-down overhead shot of a chef's hands plating a Michelin-starred tasting menu course, tweezers placing a single micro-herb, drop of golden oil, black slate plate, ultra-crisp focus, warm kitchen ambient glow.",
    modelLabel: "Kling 1.6",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(160deg, #0a0a0a 0%, #2a2a2a 55%, #c08040 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "kling-mountain-climb",
    title: "First-person alpine climb",
    prompt:
      "POV first-person shot of a climber pulling themselves up over a ridge with the Himalayan range revealing in the distance, wind-whipped snow, hands gripping rock, audible breath, sense of accomplishment.",
    modelLabel: "Kling 2.0 Pro",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(180deg, #e0e8f0 0%, #6a80a0 55%, #1a1a2a 100%)",
    aspectRatio: "9:16",
  },

  /* ── Seedance 2.0 (extended) ── */
  {
    id: "seedance2-calligraphy",
    title: "Ink calligraphy unfurling",
    prompt:
      "一支毛笔在宣纸上游走写出一个行草「永」字，墨汁晕开的瞬间凝固放大，近景特写，柔和的窗光，宣纸纤维清晰可见，东方禅意氛围。",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    author: "ByteDance",
    bg: "linear-gradient(180deg, #f0e8d8 0%, #a09080 55%, #1a1a1a 100%)",
    aspectRatio: "1:1",
  },
  {
    id: "seedance2-teahouse",
    title: "Chengdu teahouse afternoon",
    prompt:
      "成都老茶馆下午场景，竹椅旁一位老人慢慢倒茶，蒸汽缓缓升起，阳光透过窗纸斑驳洒在桌上，鸟鸣和远处麻将声，固定机位宽景。",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    author: "ByteDance",
    bg: "linear-gradient(160deg, #6a4020 0%, #c08050 50%, #f0d090 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "seedance2-highspeed-train",
    title: "High-speed train, dusk",
    prompt:
      "A high-speed bullet train passes through a vast open plain at dusk, camera is locked low to the ground as the train whips past, 0.3s exposure creates streaks of light and motion blur, pink sky.",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    author: "ByteDance",
    bg: "linear-gradient(180deg, #f0a0a0 0%, #a06080 55%, #1a1a3a 100%)",
    aspectRatio: "16:9",
  },

  /* ── Runway Gen-3/4 (extended) ── */
  {
    id: "runway-g4-dancer",
    title: "Contemporary dance studio",
    prompt:
      "A contemporary dancer performs a liquid floor phrase in a white cyclorama studio, camera is static at medium distance, side lighting creates long shadows on the floor, long take single shot.",
    modelLabel: "Runway Gen-4",
    sourceUrl: "https://runwayml.com/",
    author: "Runway",
    bg: "linear-gradient(180deg, #f0f0f0 0%, #a0a0a0 55%, #1a1a1a 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "runway-g3-liminal",
    title: "Liminal hotel hallway",
    prompt:
      "Endless hotel hallway with mismatched patterned carpet and flickering fluorescent lights, doors ajar on both sides, camera tracks forward at walking pace, slight lens distortion, unsettling quiet ambient hum.",
    modelLabel: "Runway Gen-3 Alpha",
    sourceUrl: "https://runwayml.com/research/introducing-gen-3-alpha",
    author: "Runway",
    bg: "linear-gradient(180deg, #e0c898 0%, #a07050 55%, #2a1a08 100%)",
    aspectRatio: "16:9",
  },

  /* ── Pika ── */
  {
    id: "pika-2-origami",
    title: "Origami paper crane unfolding",
    prompt:
      "A hand-folded paper origami crane sits on a wooden desk, gradually unfolds itself in reverse-time, paper creases uncreasing, morning sun through window, practical and physical aesthetic.",
    modelLabel: "Pika 2.0",
    sourceUrl: "https://pika.art/",
    author: "Pika Labs",
    bg: "linear-gradient(160deg, #2a2018 0%, #8a6040 55%, #f0d090 100%)",
    aspectRatio: "1:1",
  },
  {
    id: "pika-2-clay",
    title: "Clay character morph",
    prompt:
      "A small clay character sculpts itself from a plain brown lump into a smiling figure with round eyes and little arms, stop-motion aesthetic, 12fps feel, practical studio lighting, visible fingerprints on clay.",
    modelLabel: "Pika 2.0",
    sourceUrl: "https://pika.art/",
    author: "Pika Labs",
    bg: "linear-gradient(160deg, #3a2010 0%, #8a5020 55%, #e0b060 100%)",
    aspectRatio: "1:1",
  },

  /* ── Wan 2.7 (extended) ── */
  {
    id: "wan27-vintage-car",
    title: "Vintage car on mountain road",
    prompt:
      "A 1960s cherry-red convertible cruises along a winding mountain road at sunset, drone shot follows from above, hair blown back, engine roar echoes off cliffs, lens flares, 35mm film grain.",
    modelLabel: "Wan 2.7",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(180deg, #f08060 0%, #a04030 55%, #1a1008 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "wan27-noodle",
    title: "Hand-pulled noodles, macro",
    prompt:
      "手工拉面师傅在狭小厨房里把面团反复甩打拉伸成细长的面条，面粉飞扬，背光透过水汽，macro 特写，高帧率慢镜头。",
    modelLabel: "Wan 2.7",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(160deg, #f0e0c0 0%, #b08060 55%, #3a2010 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "wan26-space-walk",
    title: "Space walk, ISS window",
    prompt:
      "Astronaut performs a space walk outside the International Space Station, Earth blue-marble visible below, camera mounted on the station rotates slowly, tether umbilical floats, complete silence conveyed visually.",
    modelLabel: "Wan 2.6",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(180deg, #0a0a1a 0%, #2a4080 55%, #6ac0f0 100%)",
    aspectRatio: "16:9",
  },

  /* ── Luma (extended) ── */
  {
    id: "luma-jellyfish",
    title: "Bioluminescent jellyfish swarm",
    prompt:
      "A swarm of translucent bioluminescent jellyfish drifts through a deep-sea abyss, pulsing blue and violet from within, camera slowly pans through them as they part, silent and cold.",
    modelLabel: "Luma Dream Machine",
    sourceUrl: "https://lumalabs.ai/dream-machine",
    author: "Luma AI",
    bg: "linear-gradient(180deg, #0a1028 0%, #2030a0 55%, #90d0f0 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "luma-workshop",
    title: "Old watchmaker at bench",
    prompt:
      "An old watchmaker hunches over a workbench covered in tiny gears and tools, a loupe screwed into one eye, he gently inserts a mainspring into a pocket watch, warm desk lamp only light source, dust visible in the beam.",
    modelLabel: "Luma Dream Machine",
    sourceUrl: "https://lumalabs.ai/dream-machine",
    author: "Luma AI",
    bg: "linear-gradient(160deg, #1a0e05 0%, #6a4020 55%, #e8b060 100%)",
    aspectRatio: "16:9",
  },

  /* ── Hailuo ── */
  {
    id: "hailuo-night-market",
    title: "Taipei night market walk",
    prompt:
      "First-person walking tour through a busy Taipei night market, steam rising from food stalls on both sides, neon signs in Chinese characters, crowd weaves around, hand-held camera feel.",
    modelLabel: "Hailuo AI",
    sourceUrl: "https://hailuoai.video/",
    author: "MiniMax",
    bg: "linear-gradient(160deg, #2a1028 0%, #a02050 55%, #f0a040 100%)",
    aspectRatio: "9:16",
  },
  {
    id: "hailuo-typewriter",
    title: "Typewriter keys, macro",
    prompt:
      "Macro shot of a vintage typewriter typing a letter, keys strike paper in rhythmic slow motion, ink impressions bleed slightly, warm sepia tones, cork-topped desk visible in periphery.",
    modelLabel: "Hailuo AI",
    sourceUrl: "https://hailuoai.video/",
    author: "MiniMax",
    bg: "linear-gradient(160deg, #2a1a0a 0%, #7a5030 55%, #e0b080 100%)",
    aspectRatio: "16:9",
  },

  /* ── PixVerse (extended) ── */
  {
    id: "pixverse-anime-sakura",
    title: "Anime girl under sakura tree",
    prompt:
      "Anime-style young woman stands under a sakura tree as petals fall around her, she turns slowly to smile at the camera, pastel color palette, Makoto Shinkai-inspired, soft bloom on highlights.",
    modelLabel: "PixVerse v4",
    sourceUrl: "https://pixverse.ai/",
    bg: "linear-gradient(180deg, #f0d0e0 0%, #d090b0 55%, #4a2040 100%)",
    aspectRatio: "9:16",
  },

  /* ── Hunyuan / LTX (open-source) ── */
  {
    id: "hunyuan-knight",
    title: "Armored knight in fog",
    prompt:
      "A fully armored knight stands at the edge of a foggy forest clearing, sword drawn, camera slowly dollies in as the figure remains perfectly still, dawn breaks behind them, distant crow caws.",
    modelLabel: "Hunyuan Video",
    sourceUrl: "https://huggingface.co/tencent/HunyuanVideo",
    author: "Tencent",
    bg: "linear-gradient(180deg, #1a2028 0%, #607080 55%, #c0c8d0 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "ltx-racer",
    title: "Futuristic hover racer",
    prompt:
      "A sleek chrome hover racer streaks through a canyon at sunset, afterburners glow, heat haze distorts the rocks, tracking camera pulls back to reveal the scale, cyberpunk color palette.",
    modelLabel: "LTX Video",
    sourceUrl: "https://www.lightricks.com/ltxv",
    author: "Lightricks",
    bg: "linear-gradient(160deg, #0a1040 0%, #6030a0 55%, #f050a0 100%)",
    aspectRatio: "16:9",
  },

  /* ── Cinematic / experimental ── */
  {
    id: "cinematic-winter-cabin",
    title: "Winter cabin, warm window",
    prompt:
      "Slow wide shot of a snowy wilderness at night, single log cabin in the middle distance with warm orange glow from its one window, faint chimney smoke, complete silence except for wind in trees.",
    modelLabel: "Kling 2.0 Pro",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(180deg, #0a1020 0%, #3a4a60 55%, #e8a060 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "cinematic-lost-city",
    title: "Jungle-swallowed temple",
    prompt:
      "Camera flies over a vast jungle at dawn, mist clings to the treetops, suddenly a massive stone temple pyramid rises out of the canopy, vines and roots reclaiming stone, David Attenborough feel.",
    modelLabel: "Veo 3",
    sourceUrl: "https://deepmind.google/technologies/veo/",
    bg: "linear-gradient(180deg, #1a3020 0%, #4a8050 55%, #d0e060 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "experimental-liquid-metal",
    title: "Liquid metal bloom",
    prompt:
      "Extreme macro close-up of a droplet of liquid mercury blooming in reverse from impact, chrome reflective surface catches studio lights, black background, ultra slow motion 2000fps feel.",
    modelLabel: "Runway Gen-3 Alpha",
    sourceUrl: "https://runwayml.com/research/introducing-gen-3-alpha",
    bg: "linear-gradient(180deg, #0a0a0a 0%, #6a6a6a 55%, #e8e8e8 100%)",
    aspectRatio: "1:1",
  },
  {
    id: "experimental-split-diopter",
    title: "Split-diopter conversation",
    prompt:
      "A De Palma-style split-diopter shot: a young woman in sharp focus on the left reading a letter, and a man in the far background also in sharp focus looking out a window. Tension, wood-paneled 1970s interior.",
    modelLabel: "Kling 1.6",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(160deg, #2a1a08 0%, #7a5030 55%, #c0a060 100%)",
    aspectRatio: "16:9",
  },

  /* ── Portrait / face focus ── */
  {
    id: "portrait-blink-smile",
    title: "Subtle blink + smile",
    prompt:
      "Extreme close-up of a woman's face, soft window light from left, she slowly blinks, eyes reopen, corners of mouth lift into a subtle smile, 85mm anamorphic, shallow depth of field.",
    modelLabel: "Kling 2.0 Pro",
    sourceUrl: "https://kling.kuaishou.com/",
    bg: "linear-gradient(180deg, #f0d0b0 0%, #a07060 55%, #2a1a10 100%)",
    aspectRatio: "1:1",
  },
  {
    id: "portrait-old-man-hat",
    title: "Elderly fisherman, wind",
    prompt:
      "Portrait close-up of an elderly fisherman with weathered skin and white beard, ocean wind blowing through his grey hair, he squints at something off-camera then slowly smiles. Natural daylight, 85mm.",
    modelLabel: "Runway Gen-4",
    sourceUrl: "https://runwayml.com/",
    bg: "linear-gradient(180deg, #a08060 0%, #604030 55%, #1a1008 100%)",
    aspectRatio: "1:1",
  },

  /* ── Animation / stylized ── */
  {
    id: "anime-bike-ride",
    title: "Anime: countryside cycle",
    prompt:
      "Anime-style girl in school uniform pedals her bicycle down a rural road at sunset, rice paddies on both sides, long hair streams behind, warm orange key light, Shinkai-style color grading.",
    modelLabel: "Wan 2.7",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(180deg, #f0a060 0%, #c06040 55%, #2a1a28 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "claymation-monster",
    title: "Claymation monster toothbrush",
    prompt:
      "Stop-motion claymation: a two-legged clay monster stands at a tiny bathroom sink brushing its big fangs, toothpaste foam everywhere, 12fps, visible fingerprint textures, humor beats.",
    modelLabel: "Pika 2.0",
    sourceUrl: "https://pika.art/",
    bg: "linear-gradient(160deg, #4a2010 0%, #a06030 55%, #e8b080 100%)",
    aspectRatio: "1:1",
  },
  {
    id: "3d-isometric-kitchen",
    title: "Isometric cozy kitchen",
    prompt:
      "Isometric 3D illustrated scene of a cozy modern kitchen, a tiny person chops vegetables, steam rises from a pot, miniature chicken walks by, warm lighting, soft shader, ramen-style ambient loop.",
    modelLabel: "PixVerse v4",
    sourceUrl: "https://pixverse.ai/",
    bg: "linear-gradient(160deg, #f0c0a0 0%, #a06040 55%, #2a1810 100%)",
    aspectRatio: "1:1",
  },

  /* ── Multi-shot / narrative ── */
  {
    id: "multishot-detective",
    title: "Noir detective montage",
    prompt:
      "Multi-shot noir sequence: wide of a rainy alleyway, then cut to close-up of hands lighting a cigarette, then medium of trenchcoated detective in fedora turning to look at a neon hotel sign. B&W film grain.",
    modelLabel: "Wan 2.6",
    sourceUrl: "https://wan.video/",
    bg: "linear-gradient(180deg, #0a0a0a 0%, #2a2a2a 55%, #808080 100%)",
    aspectRatio: "16:9",
  },
  {
    id: "multishot-market",
    title: "Farmers market day-in-life",
    prompt:
      "Multi-shot farmers market at dawn: vendor sets up stall, steam rises from coffee cart, a child hands money for an apple, dog on leash sniffs basket. Warm summer morning, natural sound design.",
    modelLabel: "Seedance 2.0 Pro",
    sourceUrl: "https://www.volcengine.com/product/ark",
    bg: "linear-gradient(180deg, #f0c060 0%, #a08040 55%, #4a3018 100%)",
    aspectRatio: "16:9",
  },
];

/**
 * Return the curated catalog as DiscoverItem[].
 * The pseudo `videoUrl` is intentionally absent — curated entries link out
 * to their original source rather than rehosting video.
 */
export function getCurated(): DiscoverItem[] {
  return CURATED.map((c) => ({
    id: `curated:${c.id}`,
    source: "curated" as const,
    title: c.title,
    prompt: c.prompt,
    modelLabel: c.modelLabel,
    author: c.author,
    sourceUrl: c.sourceUrl,
    thumbnailUrl: `gradient:${c.bg}`,
    aspectRatio: c.aspectRatio,
    categories: inferCategories(`${c.title} ${c.prompt}`),
  }));
}

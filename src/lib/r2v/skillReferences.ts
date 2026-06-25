/**
 * Auto-bundled from video-prompt-generator skill reference files.
 * Total ~62KB, ~15K tokens — well within Qwen 128K context.
 */

export const REF_CAMERA_DICTIONARY = `
# 运镜词典 + 镜头/焦距术语

> 38 种运镜 + 镜头类型 + 焦距 + 光影术语
> 用对术语 = AI 一次出对画面

---

## 🎬 38 种运镜（按类别）

### 推拉（Push/Pull）
\`\`\`
- Slow dolly-in / Push-in     → 慢推：靠近主体
- Slow dolly-out / Pull-back  → 慢拉：远离主体
- Camera zooms / pulls back   → 拉远揭示更大场景
- Crash zoom                  → 快速推/拉（戏剧化）
- Trombone / Vertigo zoom     → 推+拉同时（眩晕）
\`\`\`

### 平移（Pan）
\`\`\`
- Pan left / Pan right        → 左/右摇
- Whip pan                    → 快速甩镜（转场）
- Slow pan across landscape   → 慢扫风景
\`\`\`

### 倾斜（Tilt）
\`\`\`
- Tilt up                     → 向上倾斜（揭示天空/高处）
- Tilt down                   → 向下倾斜（揭示地面/双脚）
- Dutch angle / Canted        → 倾斜机位（不安感）
\`\`\`

### 跟拍（Tracking）
\`\`\`
- Wide tracking shot          → 远景跟拍
- Tight side tracking         → 近距侧面跟拍
- Following shot from behind  → 后跟
- Lateral tracking            → 横向跟移
\`\`\`

### 环绕（Orbit）
\`\`\`
- 360° orbit around subject   → 围绕主体一周
- 180° arc                    → 半圆运动
- Slight orbit + tracking     → 边走边绕
\`\`\`

### 升降（Crane）
\`\`\`
- Crane up                    → 升起（远离地面）
- Crane down                  → 降下
- Boom up / Boom down         → 摇臂上/下
\`\`\`

### 俯仰（Aerial）
\`\`\`
- Bird's eye view             → 俯视（鸟瞰）
- Top-down view               → 正俯视
- Worm's eye view             → 仰视（虫视）
- Drone shot rising           → 无人机升空
\`\`\`

### 第一人称（POV）
\`\`\`
- POV (Point of View)         → 第一人称视角
- Over-the-shoulder           → 过肩镜头
- Insert / Cutaway shot       → 插入特写
- Eye-level shot              → 平视
\`\`\`

### 焦点（Focus）
\`\`\`
- Rack focus                  → 焦点转换（前后景对调）
- Pull focus from A to B      → 从 A 焦点拉到 B
- Shallow depth of field      → 浅景深
- Deep focus                  → 全景深
\`\`\`

### 特殊
\`\`\`
- Static shot / Locked off    → 完全静止
- Handheld shake             → 手持晃动
- Steadicam smooth            → 斯坦尼康平滑
- Whip pan transition         → 甩镜转场
- Match cut                   → 匹配剪辑（动作连接）
- Seamless transition         → 无缝过渡
\`\`\`

---

## 📷 景别术语

| 中文 | 英文 | 说明 |
|------|------|------|
| 远景 | Wide shot / Long shot | 主体小，环境大 |
| 全景 | Full shot | 人物全身 |
| 中景 | Medium shot | 腰部以上 |
| 中近景 | Medium close-up | 胸部以上 |
| 特写 | Close-up | 头部/脸部 |
| 大特写 | Extreme close-up | 局部（眼睛、嘴唇） |
| 大远景 | Extreme wide shot / Establishing shot | 定场镜头 |
| 标准镜 | Standard shot | 自然视角 |

---

## 🔭 镜头类型

| 名称 | 焦距 | 特点 | 用途 |
|------|------|------|------|
| 广角 | 14mm-35mm | 视野宽，畸变 | 风景、室内、宏大场面 |
| 标准 | 50mm | 接近人眼 | 人像、日常 |
| 中长焦 | 70-100mm | 压缩感 | 人像特写 |
| 长焦 | 135mm+ | 强压缩 | 体育、野生动物 |
| 微距 | Macro | 极近拍摄 | 产品细节、食物 |
| 鱼眼 | Fisheye | 强畸变 | 极端视角 |
| 移轴 | Tilt-shift | 微缩感 | 城市俯拍 |

---

## 🎞 镜头风格关键词（电影感）

\`\`\`
- Anamorphic lens / 2.39:1     → 电影宽银幕
- Cinemascope                  → 影院规格
- Cooke S4i lens flare         → 影视级镜头光斑
- Vintage glass / Soft focus   → 复古软焦
- Aged lens                    → 老镜头质感
\`\`\`

---

## 💡 光线术语

### 自然光
\`\`\`
- Golden hour / Magic hour     → 黄昏/日出黄金时段
- Blue hour                    → 黄昏后蓝色时段
- Overcast / Diffused light    → 阴天/柔光
- Tungsten window light        → 钨丝灯透窗光
\`\`\`

### 影棚布光
\`\`\`
- Soft beauty dish lighting    → 柔光美人罩
- Hard rim light               → 硬轮廓光
- Backlight / Hair light       → 逆光/发丝光
- Three-point lighting         → 三点布光
- Rembrandt lighting           → 伦勃朗光（侧脸有三角形）
- Split lighting               → 分裂光
\`\`\`

### 戏剧光
\`\`\`
- Volumetric light             → 体积光（光束可见）
- God rays / Tyndall effect    → 丁达尔效应
- Practical lighting only      → 仅实用光（无人工补光）
- Single beam of light         → 单束光
- Embers and firelight         → 余烬和火光
- Neon-lit / Cyberpunk lighting → 霓虹/赛博朋克光
\`\`\`

---

## 🎨 色调风格

\`\`\`
- Warm amber palette           → 暖琥珀色调
- Cool teal-blue shadows       → 冷青蓝阴影
- Desaturated retro            → 复古褪色
- Deep oxblood and crimson     → 深酒红色
- Honey gold and ivory cream   → 蜜金奶白
- Crushed velvet black         → 天鹅绒黑
- Pastel dreamlike palette     → 粉彩梦幻
- Monochrome / Black and white → 单色/黑白
\`\`\`

---

## 🎭 导演 / 电影风格参考

让 AI 调用经典视觉记忆：

\`\`\`
- Wong Kar-wai aesthetic        → 王家卫色调（暖、克制、慢）
- Iwai Shunji's Love Letter     → 岩井俊二（清新、阳光、青春）
- Studio Ghibli warmth          → 吉卜力（温暖、自然、奇幻）
- Pixar emotional realism       → 皮克斯（温暖现实主义）
- A24 visual tone               → A24（极简、艺术、深沉）
- Nolan epic scale              → 诺兰（史诗、宏大）
- Wes Anderson symmetry         → 韦斯·安德森（对称、复古）
- Tarsem Singh's "The Fall"     → 塔西姆·辛格（绚丽、超现实）
- Christopher Doyle handheld    → 杜可风手持
- Roger Deakins cinematography  → 罗杰·迪金斯（光感大师）
- Hirokazu Koreeda emotional    → 是枝裕和（隐忍）
- Tarsem Singh meets Iwai       → 综合参考
\`\`\`

---

## 🎯 节奏术语

\`\`\`
- Slow contemplative rhythm    → 慢沉思节奏
- Frantic pace                 → 激烈快节奏
- Languid / Languorous         → 慵懒节奏
- Steady / Locked tempo        → 平稳节奏
- Punchy fast cuts             → 快速剪辑
\`\`\`

---

## 📐 画面比例（Aspect Ratio）

| 比例 | 用途 |
|------|------|
| **16:9** | YouTube 标准、电视 |
| **9:16** | 抖音/Reels/Shorts 竖版 |
| **1:1** | Instagram 方形 |
| **4:5** | Instagram 竖版（不全竖） |
| **2.35:1** | 电影宽银幕 |
| **2.39:1** | Anamorphic 现代电影 |
| **21:9** | 超宽屏 / 史诗感 |
| **4:3** | 复古电视 |
| **9:7** | IMAX |

---

## 🔥 帧率（FPS）说明

\`\`\`
- 24fps  → 电影感（标准）
- 25fps  → PAL TV
- 30fps  → 网络视频默认
- 60fps  → 流畅运动（游戏感）
- 120fps → 慢动作（4 倍慢放）
- 240fps → 超慢动作
\`\`\`

---

## 🎬 高频组合（直接 copy）

### 电影感设置
\`\`\`
24fps, 2.35:1 anamorphic, Kodak Portra 400 film grain,
Cooke S4i lens flares, shallow depth of field
\`\`\`

### UGC 自然感设置
\`\`\`
phone camera quality, handheld feel, 9:16 vertical,
natural lighting, slightly unpolished, candid framing
\`\`\`

### 高端广告设置
\`\`\`
4K ultra HD, 16:9 cinematic, anamorphic lens,
cinematic textures, rich shadow detail, stable picture,
luxury commercial aesthetic
\`\`\`

### 复古感设置
\`\`\`
16mm film texture, heavy organic grain,
slight halation, desaturated warm grade,
1970s documentary aesthetic
\`\`\`

### 赛博朋克设置
\`\`\`
Neon-lit, Blade Runner 2049 palette,
deep teal shadows, vivid magenta and amber neon,
volumetric fog, anamorphic lens flares
\`\`\`

---

## 💡 用法心法

**1. 不要堆砌**
> 选 2-3 个最重要的关键词，不要把所有都塞进去

**2. 摄像机和主体分开**
\`\`\`
[Camera]: Slow dolly-in over 4 seconds, locked off
[Subject]: Woman remains still, then slowly raises her head
[Lighting]: Single beam of golden hour light from window
\`\`\`

**3. Happy Horse 例外**
> 用最简单的：subject does action in setting, time, atmosphere

**4. 不同模型偏好**
- Seedance：可堆较多专业术语
- Kling：偏好情境描述
- Veo 3：擅长光线和材质
- Sora 2：偏好叙事性
- Happy Horse：极简
`;

export const REF_NEGATIVE_PROMPTS = `
# 反向提示词库（Negative Prompts）

> "告诉 AI 你不要什么，比说要什么更有效"
> ── Tao Prompts 七大法则之一

---

## 🎯 通用排除（所有视频都要带）

\`\`\`
No watermarks, no subtitles, no text overlays, no logos.
No captions, no title cards, no end cards.
\`\`\`

---

## 🎵 音频排除

### 排除背景音乐
\`\`\`
No background music, no piano, no romantic score,
no swelling strings, no synth pads, no orchestral score.
\`\`\`

### 排除特定音效
\`\`\`
No gunshots, no clicking, no trigger sounds.
No footsteps, no breathing, no dialogue.
No rain on cue, no thunder.
\`\`\`

### 想要"安静感"
\`\`\`
No music. The silence itself is the score.
Only ambient sound: [具体环境音].
\`\`\`

---

## 🎬 排除"AI 套路"（常见廉价感）

### 视觉套路
\`\`\`
No autumn leaves falling on cue,
no sunset clichés,
no slow-motion hair flips,
no perfect-timing eye contact,
no rain stopping just for the character,
no spotlights from heaven,
no convenient cinematic timing.
\`\`\`

### 表演套路
\`\`\`
No dramatic over-acting,
no exaggerated expressions,
no smile that feels rehearsed,
no perfectly-timed reactions,
no telegraphed emotions.
\`\`\`

### 质感套路
\`\`\`
No plastic skin, no CGI sheen,
no overly smooth skin,
no Instagram filter look,
no oversaturated colors,
no AI-typical glossiness.
\`\`\`

---

## 🎨 排除现代元素（适用古风/复古）

\`\`\`
No phones, no laptops, no smartwatches.
No modern technology, no electronic devices.
No modern clothing, no contemporary signage.
No cars from after [年份], no LED lights.
\`\`\`

---

## 🏞 场景排除（保持简洁）

### 排除杂物
\`\`\`
No other people in background,
no extra characters, no crowds,
no distracting elements,
no clutter on the table,
no unnecessary props.
\`\`\`

### 排除特定物体
\`\`\`
No [具体物品 1], no [具体物品 2].
No visible reflections of [东西].
\`\`\`

---

## 📷 摄像/剪辑排除

\`\`\`
No camera shake, no jump cuts, no quick zooms.
No drastic color shifts between cuts.
No abrupt transitions, no flash cuts.
No lens flare, no whip pans.
\`\`\`

---

## 👤 人物排除（人脸/手部问题）

\`\`\`
No extra fingers, no malformed hands,
no distorted face, no asymmetric features,
no blurry eyes, no pupil distortion.
\`\`\`

> 💡 注意：很多新模型已经能处理手指问题，必要时再加。

---

## 🎭 风格排除（避免漫画化/动画化）

适用真实人物视频：

\`\`\`
No anime aesthetics, no cartoon stylization,
no manga style, no 3D render look,
no painterly effects, no illustration feel.
\`\`\`

适用动画视频（避免真实化）：

\`\`\`
No realistic textures, no photo-realistic skin,
no live-action feel.
\`\`\`

---

## 🎨 高端广告专用排除

\`\`\`
No casual handheld feel, no UGC aesthetic,
no phone camera quality, no amateur framing.
No rough edits, no quick cuts.
No "vlog" look.
\`\`\`

---

## 📱 UGC 广告专用排除（要"看起来不像广告"）

\`\`\`
No professional studio lighting,
no expensive setup, no cinematic gimbal,
no perfect framing, no expensive set design.
No commercial actor poses,
no stiff posing, no over-rehearsed delivery.
\`\`\`

---

## 🔇 对话戏特别排除

适用情感戏（避免戏剧化）：

\`\`\`
No swelling music, no dramatic pause music.
No tear-jerker score, no piano during emotional beat.
No applause, no audience reaction.
\`\`\`

---

## 🌆 城市/赛博朋克场景

排除常见的"过度赛博"：

\`\`\`
No excessive holograms, no flying cars in every shot,
no overly dystopian atmosphere,
no clichéd cyberpunk tropes.
\`\`\`

---

## 🌸 复古/怀旧场景

\`\`\`
No modern fonts on signs, no contemporary brands,
no smartphones, no LED billboards,
no recent vehicle models.
\`\`\`

---

## 🎬 完整模板（5 类组合）

### 模板 A：电影感写实
\`\`\`
Negative:
No watermarks, no subtitles, no text overlays.
No background music, no swelling score.
No anime style, no cartoon stylization.
No plastic skin, no CGI sheen.
No autumn leaves clichés, no slow-motion hair flips.
No perfect-timing eye contact.
\`\`\`

### 模板 B：高端广告
\`\`\`
Negative:
No watermarks, no subtitles, no text overlays.
No music, no dialogue, no extra people.
No casual handheld feel, no UGC aesthetic.
No oversaturated colors, no Instagram filter.
No clutter on the set.
[品牌名] is the only logo visible.
\`\`\`

### 模板 C：UGC 真实感
\`\`\`
Negative:
No professional studio lighting,
no cinematic gimbal, no commercial actor poses.
No perfect framing, no over-rehearsed delivery.
No expensive set design.
No music sting, no dramatic transitions.
\`\`\`

### 模板 D：古装 / 复古
\`\`\`
Negative:
No phones, no laptops, no modern technology.
No LED lights, no contemporary signage.
No modern clothing in background.
No anachronistic elements.
[特定排除]
\`\`\`

### 模板 E：情感戏
\`\`\`
Negative:
No dramatic music, no swelling strings.
No piano during emotional beats.
No over-acting, no exaggerated expressions.
No tear-jerker score.
No convenient cinematic timing.
The silence is the emotion.
\`\`\`

---

## ⚠️ Negative 写作原则

### 1. 越具体越好
\`\`\`
❌ "no bad quality"
✅ "no plastic skin, no oversaturated colors, no AI sheen"
\`\`\`

### 2. 排除"AI 默认行为"
\`\`\`
AI 默认会加：背景音乐、夸张表情、花叶飘落
明确说不要 → 反而更真实
\`\`\`

### 3. 排除"类型片套路"
\`\`\`
比如对话戏 → AI 默认加配乐
明确"No music" → 让画面自己说话
\`\`\`

### 4. 不要排除矛盾
\`\`\`
❌ "no music" + "with background score" 
（同时出现，AI 困惑）
\`\`\`

### 5. Happy Horse 不要太多
\`\`\`
Happy Horse 偏好短指令
Negative 也要简化，3-5 条核心即可
\`\`\`

---

## 💎 终极排除清单（粘贴即用）

如果不知道排除什么，**粘贴这个最安全的版本：**

\`\`\`
Negative:
No watermarks, no subtitles, no text overlays, no logos, no captions.
No background music, no dramatic score.
No phones, no laptops, no modern electronics.
No extra people, no crowds.
No exaggerated expressions, no over-acting.
No plastic skin, no AI sheen, no oversaturated colors.
No cliché slow-motion, no perfect-timing reactions.
No camera shake, no jump cuts, no quick zooms.
\`\`\`

---

## 🎯 一个真实案例对比

**没用 Negative：**
\`\`\`
Prompt: A woman walks through Tokyo at night.

→ AI 给你：
- 加了感伤钢琴
- 头发被风吹起的慢镜头
- 雨刚好停
- 完美的眼神交流
- 完全像 AI 生成
\`\`\`

**用了 Negative：**
\`\`\`
Prompt: A woman walks through Tokyo at night.

Negative:
No music. No piano.
No slow-motion hair flips, no rain stopping for her.
No spotlights from heaven, no perfect-timing eye contact.
No dramatic over-acting.

→ AI 给你：
- 安静的脚步声
- 真实的雨声
- 自然的步态
- 像真的电影
\`\`\`

---

**最重要的法则：**

> **Negative 是反向引导 AI 的训练数据。**
>
> AI 训练时见过太多"廉价 AI 视频"，
> 你必须明确告诉它"不要那种"，
> 它才能调用更高质量的训练数据。
`;

export const REF_OPTIMIZATION_CHECKLIST = `
# 提示词优化全要点清单

> 写 prompt 前 / 写完后对照检查
> 全部来自 7 个高质量教程 + R2V 实战补充

---

## 🏆 一句话压缩

> **找对关键词 + 锁住 5 要素 + 抽象转视觉 + 商业链路保留 + 短测多迭代**

---

## 一、核心心法（4 条）

\`\`\`
1. AI 是摄影组，你是导演 [Ľudovít]
   → 先有完整作品概念，再开 AI

2. 客户视角是唯一标准
   → "看，AI 做的！" ❌
   → "等等，这是 AI？" ✅

3. 短 prompt + 追问修改 > 一次写满 [柚智/Tim]
   → 不要堆 3000 字，看图说话再迭代

4. 期望管理：第一次不完美是常态 [Ľudovít]
   → 一镜跑 5-10 次正常
   → 删掉差的，留最好的
\`\`\`

---

## 二、结构层（7 条法则）

### 1. 重要信息放前几个词 [Artturi]
\`\`\`
❌ "ultra detailed, 8K, masterpiece, woman holding coffee..."
✅ "Woman holding coffee, photorealistic, 8K..."
\`\`\`

### 2. 5 要素锁定 [Verum]
\`\`\`
✅ Character    角色长相
✅ Identity     身份/职业
✅ Outfit       服装
✅ Environment  环境
✅ Vibe         氛围气质
\`\`\`

### 3. 摄像机 / 主体 / 环境分开描述 [Tao Prompts]
\`\`\`
[Camera]: Slow dolly-in over 4 sec, locked off
[Subject]: Woman raises her head slowly
[Environment]: Empty classroom, single desk lamp
\`\`\`

### 4. Multi-Shot 4 镜头标准 [Adrian]
\`\`\`
Shot 1 (3s): 钩子 / 开场
Shot 2 (3s): 使用 / 推进
Shot 3 (3s): 卖点 / 转折
Shot 4 (4s): 收尾 / Pack shot
\`\`\`

### 5. 时间码精确 [灵姐 + Sirio]
\`\`\`
不要："几秒后"
要：   "0-2s, 2-5s"
\`\`\`

### 6. 锚点防漂移 [Tao Prompts]
\`\`\`
"Character has small mole below left eye"
"Red elastic on right wrist"
→ 跨镜头跨帧保持一致
\`\`\`

### 7. Negative 排除 AI 套路 [Ľudovít]
\`\`\`
No autumn leaves clichés
No slow-motion hair flips
No perfect-timing eye contact
No piano during emotional beat
\`\`\`

---

## 三、内容层（让画面"贵"的 5 个技巧）

### 1. 抽象卖点必须转视觉锚点 ⭐ 最值钱
\`\`\`
❌ "显瘦、显白、有质感"
✅ "面料垂坠在腰间形成自然褶皱（不紧绷）"
✅ "侧逆光在锁骨处形成高光，衬托肤色通透感"
\`\`\`

### 2. 调用电影记忆库
\`\`\`
"Wong Kar-wai meets Iwai Shunji aesthetic"
"Kodak Portra 400 film grain"
→ AI 看到这些词会调用对应训练数据
\`\`\`

### 3. 物理细节 > 形容词
\`\`\`
❌ "beautiful sunset"
✅ "golden hour light streaming through paper windows,
    Tyndall rays visible in dust particles"
\`\`\`

### 4. 微表情 > 情绪词
\`\`\`
❌ "she looks sad"
✅ "her lashes flutter once, then she looks down"
\`\`\`

### 5. 单一动作原则 [Austin Chou]
\`\`\`
一个 5-10s 的镜头只放 1 个核心动作
多动作必崩
\`\`\`

---

## 四、模型适配速查

| 模型 | prompt 偏好 | 强项 | 弱项 |
|------|-----------|------|------|
| Seedance 2.0 | 长 + 专业术语 | 产品/CGI/电影感 | 真人脸限制 |
| Kling 3.0 | 情境化描述 | 真人特写 | 武打弱 |
| Veo 3 | "引号"内嵌配音 | 文字渲染 | 比例限制 |
| Sora 2 | 叙事性 + @character | 多角色一致性 | 不让真人 |
| Happy Horse | 灵活（结构化均可）| 液体/材质/慢节奏 | 复杂武打、首尾帧 |

---

## 五、R2V 参考图层（7 条铁律）

### 1. 识别 4 种写法
\`\`\`
写法一：单主体多角度
写法二：主体 + 场景分离
写法三：多主体交互
写法四：剧情分镜（按图序）
\`\`\`

### 2. 【图N】标签明确对应 ⭐
\`\`\`
"【图1】= 角色身份"
"【图2】= 场景参考"
"【图3】= 产品锚定"
不要让 AI 猜哪张图干嘛
\`\`\`

### 3. 保留商业链路 > 画面美感 ⭐⭐⭐
\`\`\`
广告类 R2V 的灵魂：
产品展示步骤必须保留
不要为"电影感"删掉涂抹/打开/试穿动作
\`\`\`

### 4. 防止口播覆盖
\`\`\`
多镜头产品演示 → 不要被压成单一口播自拍
（美黑油 UGC 失败案例就是这么死的）
\`\`\`

### 5. 多批次图片严格隔离
\`\`\`
不同色系/版本不可混用
一次只做一个 SKU
\`\`\`

### 6. "sees/meets" 陷阱
\`\`\`
❌ "@image1 sees @image2 on a street"
   → 两个角色挤在第一帧
✅ "@image1 is alone on a street, 
    @image2 walks past after 3 seconds"
\`\`\`

### 7. 强制约束语言
\`\`\`
❌ "记得展示一下产品"
✅ "必须保留产品打开 → 试用 → 收回的完整步骤"
"必须/不得"比软描述强 10 倍
\`\`\`

---

## 六、电商专属（vs Luxury 差异）

\`\`\`
1. 节奏：< 15s，关键信息前 3 秒
2. 产品出现：每个镜头都要在
3. Pack shot 必备（产品 + 品牌 + 卖点文字）
4. 调色：明亮透气，不要"crushed velvet"
5. 4 镜头结构：钩子 → 使用 → 卖点 → Pack
6. 6 大品类自动适配：
   美妆 / 服装 / 数码 / 食品 / 家居 / 运动
\`\`\`

---

## 七、迭代心法（70 分 → 95 分）

### 1. PS 修 > 重 roll [Ľudovít]
\`\`\`
AI 9 成对 1 成错时
→ Photoshop 几秒搞定
→ 重 roll 可能 5 次都未必更好
\`\`\`

### 2. 加速隐藏瑕疵
\`\`\`
中段画面崩 → 1.5-2 倍加速
广告本来就要快
\`\`\`

### 3. 强加 motion blur
\`\`\`
转场不干净 → AE 加运动模糊
模糊掩盖一切
\`\`\`

### 4. 反复编辑会降级 [Craig]
\`\`\`
同一图多次编辑 → 画质下降
解法：复制到新 chat 重做
\`\`\`

### 5. 480p → 1080p 两步走
\`\`\`
省 80% 预算
测试阶段不用追求清晰
\`\`\`

---

## 八、后期音频（被低估的 50%）

### 1. 音效 = 情绪粘合剂 [Ľudovít]
\`\`\`
"音效比再多调色都有效"
\`\`\`

### 2. 必加的环境音
\`\`\`
- 开/关门声
- 倒水声 / 液体声
- 脚步声
- 翻书声
- 玻璃落定声
- 喷雾声
\`\`\`

### 3. 配乐要克制
\`\`\`
"No music" 比配错乐更有力
情感戏让"silence be the score"
\`\`\`

### 4. 配音工具
\`\`\`
国际：ElevenLabs（最佳）
中文：海螺 AI
集成：剪映 AI 配音
\`\`\`

---

## 九、写 prompt 前后的 8 项自检 ⭐

**写之前：**
\`\`\`
☐ 1. 想清楚完整作品概念了吗？（不是想到哪写到哪）
☐ 2. 5 要素锁定了吗？（C/I/O/E/V）
☐ 3. 重要信息放前面了吗？
☐ 4. 摄像机/主体分开描述了吗？
\`\`\`

**写之后：**
\`\`\`
☐ 5. 抽象卖点都转视觉锚点了吗？
☐ 6. 锚点细节够不够（防漂移）？
☐ 7. Negative 排除了哪些 AI 套路？
☐ 8. R2V 的话，每张图标用途了吗？
\`\`\`

---

## 🎯 不同场景的优先级

### 生成普通短片
\`\`\`
重点：1 + 2 + 5 + 6 + 7
（核心心法 + 结构 + 视觉锚点 + 锚点 + Negative）
\`\`\`

### 生成商业广告（重点）
\`\`\`
重点：3 + 5 + 6 + 7 + 8
（结构 + 视觉锚点 + R2V 商业链路 + 电商规范 + 迭代）
\`\`\`

### 生成 R2V 多图视频
\`\`\`
重点：5 是核心
（每张图明确用途 + 商业链路 + 强制约束语言）
\`\`\`

### 生成情感戏
\`\`\`
重点：1 + 4 + 7
（导演思维 + 微表情/物理细节 + 排除戏剧化套路）
\`\`\`

---

## 💎 最容易忽略的 3 条

\`\`\`
1. 商业链路保留 > 画面美感
   → R2V 商业广告最大坑

2. 抽象卖点转视觉锚点
   → "显瘦"必须翻译成具体物理描述

3. 音效 ≈ 50% 完成度
   → 没音效的视频永远像"试制品"
\`\`\`

---

## 🚫 三个最常见的失败模式

### 模式 A：堆砌型失败
\`\`\`
症状：prompt 1500 字，结果反而很差
原因：所有词权重稀释，AI 抓不住重点
解法：精简到 200-500 字 + 结构清晰
\`\`\`

### 模式 B：抽象型失败
\`\`\`
症状：用了"高级感、显瘦、有质感"
原因：AI 不懂主观感受词
解法：转成具体物理/光线/材质描述
\`\`\`

### 模式 C：贪心型失败
\`\`\`
症状：5 秒里塞 4 个动作
原因：AI 处理不了短时间多动作
解法：拆成多段，每段 1 个核心动作
\`\`\`

---

## 📋 速查：每个失败原因的对应解法

| 失败现象 | 解法 |
|---------|------|
| 角色变脸 | 加锚点 + R2V 多角度参考图 |
| 中段崩 | 加速 1.5-2 倍 |
| 转场不干净 | Motion blur 模糊 |
| 标签错乱 | PS 修，不重 roll |
| AI 感太重 | Negative 排除"AI 套路" |
| 没情绪 | 加微表情 + 环境音效 |
| 产品不突出 | 强制约束 + 锚点 |
| 跑出来不像广告 | 删除 Luxury 词，加电商节奏 |

---

**这份清单的使用方式：**

\`\`\`
写 prompt 前：浏览一遍，建立心智模型
写 prompt 中：参考具体技巧
写 prompt 后：用 8 项自检过一遍
跑出问题时：查"失败现象→解法"表
\`\`\`

---

最后一句：
> **不要把这当成"必须遵守的规则"。**
> **这是「老司机告诉你避坑的经验」。**
> 你跑得多了，会形成自己的判断。
> 那时候，可以不看清单。
`;

export const REF_PROMPT_TEMPLATES = `
# 视频生成 Prompt 模板库

> 全部经过实战验证，可 copy-paste

---

## 📋 模板分类

1. [Multi-Shot 通用模板](#multi-shot-通用模板)（标准 4 镜头）
2. [文生视频模板](#文生视频模板)
3. [图生视频模板](#图生视频模板)
4. [首尾帧模板](#首尾帧模板)
5. [产品广告模板](#产品广告模板)
6. [人物对话模板](#人物对话模板)
7. [UGC 风格模板](#ugc-风格模板)
8. [Happy Horse 极简模板](#happy-horse-极简模板)
9. [Sora 2 Character 模板](#sora-2-character-模板)
10. [Veo 3 配音模板](#veo-3-配音模板)
11. [Storyboard Magic Prompt](#storyboard-magic-prompt)（一次出多张连贯图）

---

## Multi-Shot 通用模板

适用：Seedance 2.0 / Kling / Higgsfield / Runway

\`\`\`
[整体描述]
A [类型] of [角色] doing [事情] in [场景], 
[时间], [氛围], [比例如 16:9 cinematic].

Shot 1 (3 sec): 
[镜头类型] of [发生什么]

Shot 2 (3 sec):
[镜头类型] of [发生什么]

Shot 3 (3 sec):
Cut to [新视角], [发生什么]

Shot 4 (4 sec):
Final shot - [收尾画面]

Style: 
[风格关键词，如：Cinematic luxury commercial, 
warm amber palette, shallow depth of field]

Character: 
[角色细节，越具体越好]

Negative: 
No watermarks, no subtitles, no text overlays.
[其他排除项]
\`\`\`

---

## 文生视频模板

适用：无参考图，需要 AI 完全凭文字生成

\`\`\`
A nostalgic memory of [核心场景], 
[胶片类型如 Kodak Portra 400] film grain, 
[导演风格如 Wong Kar-wai meets Iwai Shunji] cinematography,
[比例如 2.35:1 anamorphic], [帧率如 24fps slow rhythm].

[CHARACTER LOCK - 5 要素]
She: [年龄] old [国籍] [身份],
[发型] hair, [脸部特征],
[服装关键细节],
[气质参考如 Vivian Leigh meets young Tang Wei].

[LOCATION LOCK]
Setting: [具体场景描述],
[关键道具], [光线特征],
[氛围].

[TIMESTAMP]
Shot 1 (0-3s): [描述]
Shot 2 (3-7s): [描述]
Shot 3 (7-12s): [描述]
Shot 4 (12-15s): [描述]

[ANCHOR DETAILS]
[可识别细节 1]
[可识别细节 2]
[这些在每帧都要保持]

[NEGATIVE]
[排除清单]

[画质]
4K ultra HD, [滤镜], [画面比例]. No subtitles. No score.
\`\`\`

---

## 图生视频模板

适用：已有首帧图

\`\`\`
[BASE - 基于首帧延续]
The character (already in frame) [接下来的动作].
Camera: [运镜方式].

[ACTION DETAILS]
At 0-2s: [动作 1]
At 2-4s: [动作 2]
At 4-end: [收尾]

[CONSISTENCY ANCHORS]
Maintain everything consistent with the source image:
- [角色细节]
- [服装]
- [背景元素]

[STYLE]
[继承首帧的风格]

[NEGATIVE]
No additional characters appearing.
No drastic style changes.
[其他排除]
\`\`\`

---

## 首尾帧模板

适用：精确动作控制 / 形变 / 转场

\`\`\`
Start frame: [描述开始画面]
End frame: [描述结束画面]

The transformation/movement between the two frames:
[具体过程描述，如缓慢、加速、形变阶段]

Duration: [X seconds]
Camera: [运镜，如 static / slow zoom / orbit]
Motion style: [organic / mechanical / fluid]

[ANCHOR]
Maintain [角色/物体] identity throughout.
[关键细节] should remain visible.

[NEGATIVE]
No abrupt cuts. No camera shake.
[其他排除]
\`\`\`

---

## 产品广告模板

适用：商品展示 / 广告片

\`\`\`
[BRAND] commercial, [产品类型], [氛围如 luxury / minimalist / fresh],
[场景如 dark oak bar / white kitchen / marble bathroom],
warm/cool [color] lighting, slow cinematic mood.

Shot 1 (3s): 
Empty/simple setup with [产品] in frame,
[光线描述], camera slowly pushes in to extreme close-up.

Shot 2 (4s): 
[Action 1 涉及产品 - 如倾倒/打开/取出]
[macro details 如气泡/光泽/纹理]

Shot 3 (4s): 
Macro close-up of [产品的核心特性],
[感官细节如 condensation / steam / sparkle].

Shot 4 (4s): 
Hero shot - [产品名] alone on [背景],
[环境光 - 如 single beam of light].
Camera: slow rotating dolly, 30 degrees.
End on perfectly centered front-facing label.

[ANCHOR DETAILS]
[品牌名] label visible and readable throughout.
[产品颜色/形状] consistent in all shots.

Style: Cinematic luxury commercial, 
[color palette], shallow depth of field, anamorphic.

Negative: No music, no dialogue, no extra people, 
no text overlays, no logos other than [品牌名].
\`\`\`

---

## 人物对话模板

适用：剧情戏 / 对话戏（Kling 3.0 / Sora 2）

\`\`\`
A scene of [人物 A] and [人物 B] [情境] in [场景],
[氛围], [光线].

Shot 1 (3s): 
[人物 A] [动作/表情],
camera [运镜].

Shot 2 (4s): 
Cut to [人物 B] @reference_image.
[人物 B] says: "[台词]"
[情绪描述如 quietly / tearfully / hesitantly]

Shot 3 (4s): 
Cut back to [人物 A].
[人物 A] reacts: [表情/动作描述]
[人物 A] says: "[回复台词]"

Shot 4 (4s):
Wide shot - both characters in frame,
[关系动态描述].

[ANCHOR]
[人物 A] always wears [关键细节].
[人物 B] always has [关键细节].
[场景标志] visible in background of every shot.

Style: [电影感关键词],
restrained emotion, slow contemplative pacing.

Negative: 
No dramatic music, no swelling strings,
no over-acting, no perfect-timing.
\`\`\`

---

## UGC 风格模板

适用：抖音/Reels"看起来像真人随手拍"

\`\`\`
[Brand description]
A relatable UGC video of [产品].

[CHARACTER]
[年龄] year old [国籍] [性别], in [casual setting like bedroom/gym/kitchen],
authentic, honest, relatable, slightly unpolished and genuine look.
The person feels like a friend recording for their WhatsApp group.

[ACTION]
Holding and using the [产品] in a natural candid setting.
[具体动作描述]

[KEY: AVOID THESE WORDS]
NOT: polished, studio quality, cinematic, professional, dramatic
USE: authentic, candid, casual, real, slightly unpolished

[STYLE]
The user and environment should feel real, slightly unpolished, 
and spontaneous, like a quick recommendation captured in the moment.
Phone camera quality, handheld feel.

Duration: 13 seconds
Aspect ratio: 9:16

Negative:
No professional lighting, no expensive setup,
no over-processed colors, no perfect framing.
\`\`\`

---

## Happy Horse 极简模板

适用：Happy Horse 1.0（短 prompt 偏好）

\`\`\`
[Setting]: [一句话场景]
[Subject]: [主体名词] [一个动作]

Shot 1 (3s): [简单描述]
Shot 2 (4s): [简单描述]
Shot 3 (3s): [简单描述]

Style: [一句话风格]
No music. No dialogue.
\`\`\`

**总长度控制在 150-200 字内。**

具体例子：
\`\`\`
University library, golden afternoon, 1920s.

Shot 1 (4s): Beautiful young woman asleep at oak table, 
            head on arm. Camera slowly pushes in.
Shot 2 (5s): Across the table, young man in glasses watches. 
            Her lashes flutter. He looks down quickly.
Shot 3 (4s): Their eyes meet. She bites her lip. 
            He smiles, helpless.
Shot 4 (2s): Wide shot, two figures in vast library.

Style: Warm film grain. No music. No dialogue.
\`\`\`

---

## Sora 2 Character 模板

适用：已经创建好 Character 后调用

\`\`\`
@your_character_name [动作描述]

Shot 1 (5s): @your_character_name [动作 1]
Shot 2 (5s): @your_character_name [动作 2]
Shot 3 (5s): Wide shot of @your_character_name [收尾]

Style: [风格]

Audio: 
[可选 - "引号内为旁白"]
\`\`\`

⚠️ 关键：**每段都要 @ 你的角色**，否则后段可能丢失角色

---

## Veo 3 配音模板

适用：需要 AI 自动生成配音

\`\`\`
[场景描述]

A [角色] in [场景] [动作描述].
Camera: [运镜].
Lighting: [光线].

"[这里写要让 AI 念出的台词或旁白]"

[继续场景 / 镜头切换]

[更多 Shot 可继续，台词用引号包裹]

Style: [风格关键词]

Audio: ON
\`\`\`

⚠️ 关键技巧：**引号内的文字会被 Veo 3 自动生成同步配音**

---

## Storyboard Magic Prompt

适用：让 GPT Image 2 一次生成多张连贯图（不是视频）

\`\`\`
I want you to create a total of 5 images utilizing this prompt 
as the starting point of a story, and I want you to create 
5 images like a storyboard that tells the story of [角色] doing [事情].

Maintain absolute consistency across all images:
- Same character (face, hair, clothing)  
- Same location/environment
- Same lighting and color palette
- Same visual style

Generate all 5 images.
\`\`\`

⚠️ 必须 ChatGPT Plus + Thinking Mode

得到 5 张图后，再用上面任意视频模板分别生成视频片段。

---

## 🎁 Bonus：让 ChatGPT 帮你优化 Prompt

\`\`\`
我想为这张图写一个 [Seedance 2.0 / Kling / Veo] 视频提示词。
请通过问我 10 个问题来帮我搞清楚我想要什么。
每个问题给我 3 个建议选项。
全部回答完后，输出一份完整的 Multi-Shot 提示词。
\`\`\`

---

## 通用结构（所有模板的底层框架）

\`\`\`
[场景 + 风格]   ← 第一句锁定全片调性
       ↓
[角色锁定 5 要素]
       ↓
[Multi-shot 时间轴]
       ↓
[Anchor 锚点细节]
       ↓
[Style 风格强调]
       ↓
[Negative 排除项]
       ↓
[画质后缀 + 比例]
\`\`\`

---

**最重要的原则：**

> **重要信息放最前几个词。**
>
> AI 视频模型对 prompt 前部权重最高。
> 把"我要什么"放最前，"怎么呈现"放后面。
`;

export const REF_R2V_COMPLETE_GUIDE = `
# R2V 完整指南（多图参考生视频）

> R2V = Reference-to-Video，1-9 张参考图 + 必填提示词
> 图片 = 视觉参考素材，提取特征融入视频
> **核心约束：参考图承担人物、产品、场景锚定。Prompt 既要调用参考图，又要说明它们的关系。**

---

## 📋 R2V vs I2V 的本质区别

| 维度 | I2V（图生视频）| R2V（参考图生视频）|
|------|--------------|------------------|
| 图片数量 | 1 张 | 1-9 张 |
| 图片角色 | 首帧（视频从这帧开始）| 参考特征（被提取融入）|
| Prompt 必填 | 可选 | **必填** |
| AI 行为 | 让首帧动起来 | 综合多图特征生成 |
| 适合场景 | 已有完美首帧 | 复杂剧情、多角色、商业广告 |

---

## 🎯 4 种常见写法（按场景选）

### 写法一：单主体 + 多角度/多状态

**何时用：** 让模型完整理解主体外观

**上传素材：** 同一角色/产品的多角度照片

**示例：**
\`\`\`
上传：角色正面照、侧面照、全身照（共 3 张）

提示词：
一位短发女性穿着红色大衣走在雨中的东京街头，
撑着透明雨伞，霓虹灯倒映在湿润的地面上，
镜头从正面缓慢移到侧面跟拍，电影感画面。
\`\`\`

---

### 写法二：主体 + 场景分离

**何时用：** 角色在 A 场景，产品在 B 场景

**上传素材：** 一部分图提供主体外观，另一部分图提供场景背景

**示例：**
\`\`\`
上传：图 1-2 为产品图（运动鞋），图 3 为场景参考（沙漠日落）

提示词：
一双白色运动鞋从沙丘顶部滚落，沙粒飞溅，
背景是金色日落，镜头跟随鞋子运动轨迹，
慢动作，广告质感。
\`\`\`

---

### 写法三：多主体交互

**何时用：** 不同角色/物体之间互动

**上传素材：** 不同主体的参考图，prompt 描述互动

**示例：**
\`\`\`
上传：图 1 为橘猫，图 2 为黑色拉布拉多

提示词：
一只橘猫和一只黑色拉布拉多在草地上追逐嬉戏，
橘猫跳到拉布拉多背上，
阳光明媚，绿色草坪，中景拍摄，自然抓拍风格。
\`\`\`

---

### 写法四：剧情分镜/故事线 ⭐ R2V 终极用法

**何时用：** 按画面顺序上传参考图，模型按图片顺序组织视频

**上传素材：** 按画面顺序排列的参考图

**示例：**
\`\`\`
上传：图 1 咖啡豆特写，图 2 手冲咖啡过程，图 3 拉花成品

提示词：
展示手冲咖啡的完整过程，从咖啡豆研磨开始，
到热水缓缓注入滤杯，最后呈现一杯精美的拿铁拉花，
暖色调，微距与中景交替，ASMR 氛围感。
\`\`\`

---

## 💎 优秀案例库（含优化前后对比）

### 案例 1：皮克斯办公女孩（R2V 多图组合典范）

\`\`\`
生成一段皮克斯视频：
镜头围绕办公桌前的女孩环绕运镜，
女孩正坐在电脑前若有所思【图1】，
过程中切镜，特写女孩的脸部特写【图2】，
女孩的表情体现出百思不得其解的状态，
而突然女孩眼前一亮，脸上立刻舒展浮现出惊喜的笑意【图3】，
体现出女孩想到了一个好主意，
而此时镜头继续环绕运镜，
女孩思考得到答案后，开心的把脚翘到办公桌上并双手抱在脑后【图4】，
体现出她非常愉悦放松的状态和心情。
\`\`\`

**亮点：**
- 4 张参考图对应 4 个情绪阶段（若有所思 → 百思不得其解 → 惊喜 → 愉悦放松）
- 每阶段有明确表情变化和动作
- 镜头环绕运镜贯穿始终

---

### 案例 2：大龄妈妈装（"显瘦"转视觉锚点）

#### ❌ 优化前
\`\`\`
一个中年妈妈穿着这套衣服，
显瘦，遮肚子，在小区花园散步。
\`\`\`

**问题：**
- "显瘦"、"遮肚子"是抽象卖点
- 缺少视觉锚点
- 场景过于笼统

#### ✅ 优化后
\`\`\`
【镜头 1 | 中景/平视 | 缓跟运镜 | 5 秒】

傍晚金色阳光透过梧桐叶洒落，小区花园石板路上。
一位 50 岁左右的女性身穿深蓝色 A 字连衣裙，
裙摆在小腿处自然摆动。
面料垂坠感强，在腰间形成自然褶皱而非紧绷，
走动时裙身随步伐轻微荡开。
她面带从容微笑，一手轻提草编包，
步伐稳健自信。
\`\`\`

**优化要点：**
- "显瘦遮肚子" → "面料垂坠感强，腰间形成自然褶皱而非紧绷"
- "散步" → 具体时间 + 光线 + 动作 + 微表情

---

### 案例 3：年轻女性上衣（"显白"转光线锚点）

#### ❌ 优化前
\`\`\`
一个年轻女生穿着白色上衣，
很显白，在咖啡店里。
\`\`\`

**问题：**
- "显白"是主观感受
- 没有光线方向说明
- 没有材质细节

#### ✅ 优化后
\`\`\`
【镜头 1 | 近景/侧 45 度 | 固定机位 | 4 秒】

午后咖啡店靠窗位置，柔和的侧逆光从窗户洒入。
一位 25 岁左右的女性身穿奶白色针织上衣，
光线在她锁骨和肩线处形成柔和的高光，
衬托出肤色的通透感。
她单手托腮望向窗外，眼神放空，
嘴角带着若有若无的笑意。
针织面料在光线下呈现细腻的绒毛质感。
\`\`\`

**优化要点：**
- "显白" → "侧逆光在锁骨和肩线处形成高光，衬托肤色通透感"
- 加入材质细节（针织绒毛）+ 物理细节

---

### 案例 4：年轻女性套装（展示节奏控制）

#### ❌ 优化前
\`\`\`
模特穿着这套衣服走秀，
展示一下正面侧面背面。
\`\`\`

**问题：**
- "走秀"过于宽泛
- 未指定展示顺序和节奏
- 缺少服装细节

#### ✅ 优化后
\`\`\`
【镜头 1 | 全景/平视 | 环绕运镜 | 8 秒】

纯白极简摄影棚，均匀柔光箱打光。
模特身穿米色西装套装站在圆形展台中央。

镜头从正面开始缓慢环绕：
0-3 秒：展示西装外套的戗驳领线条和双排扣设计
3-5 秒：转至侧面展示裤装的垂坠感和裤线
5-8 秒：转至背面展示后腰的收省工艺和肩背的贴合度

模特保持自然站姿，偶尔轻微调整重心，
面料在灯光下呈现细腻的羊毛混纺纹理。
\`\`\`

**优化要点：**
- 明确展示顺序和时间分配（0-3/3-5/5-8）
- 每段时间对应具体展示内容
- 加入材质细节 + 微表情

---

### 案例 5：美黑油 UGC（保留商业链路教训）⚠️ 失败案例

**原始目标：** 多镜头 UGC 产品种草
- 油滴入乳液 → 双手混合 → 涂抹脸颈 → 展示瓶身 → CTA → 结束动作

**第一版优化效果：** 人物近景更自然，油腻蜡像感改善

**第一版问题：**
> 把多镜头产品演示**压成单一口播自拍**，删除了关键产品展示步骤

**核心教训：**
> **产品类 Prompt 先保留商业展示链路，再修补人物表情、皮肤质感和镜头真实感。**
>
> 广告类 Prompt 的核心不是"画面好看"本身，
> 而是**产品展示意图是否被保留**。

---

## 📐 多图使用注意事项

\`\`\`
✅ 多张图的比例尽量一致，且与目标视频比例接近
✅ 多张图最好围绕同一主题，避免塞入无关图片干扰模型理解
✅ 图片顺序有意义——按期望的画面/剧情顺序排列参考图
✅ 提示词必须填写，且应明确描述每组图的用途和期望画面内容
✅ 参考图分辨率 ≥ 400×400
\`\`\`

---

## ❌ 反例（千万别这么写）

### 反例 1：未明确参考图对应关系
\`\`\`
❌ 错误：
"参考这些图片生成一段视频。"

问题：模型不知道哪些是人物、哪些是产品、哪些是场景。
\`\`\`

### 反例 2：多批次图片混用
\`\`\`
❌ 错误：
将不同产品系列（如军绿色版和香槟金版）的图片混在一起提交。

问题：模型可能混淆不同色系的产品特征，产生幻觉。
\`\`\`

### 反例 3：删除产品展示链路
\`\`\`
❌ 错误：
为了追求电影感，把产品涂抹动作删掉，只留面部特写。

问题：广告类 Prompt 的核心是保留商业展示链路，
画面好看但产品缺失是本末倒置。
\`\`\`

---

## 🔒 R2V 参考图锚定规则（6 条）

\`\`\`
1. 明确角色身份
   → character1 / character2 分别是谁
   → 对应哪张参考图

2. 区分图片用途
   → 哪些是人物身份
   → 哪些是产品
   → 哪些是场景

3. 锁定空间关系
   → 人物和产品在镜头中的相对位置
   → 谁在前、谁在后

4. 保护商业链路 ⭐ 最重要
   → 哪些台词必须保留
   → 哪些产品展示步骤必须保留

5. 防止口播覆盖
   → 是否存在产品展示被口播表演覆盖的风险
   → 单一自拍口播会"吞掉"产品展示

6. 批次隔离
   → 不同产品系列的图片严格区分
   → 标注来源和对应 Prompt 版本
\`\`\`

---

## 🎯 R2V 核心技巧总结（5 条）

\`\`\`
1. 明确 [Image N] 标签对应关系
   → 每张参考图在 Prompt 中标注用途
   → 例：【图1】= 角色身份，【图2】= 场景，【图3】= 产品

2. 先保留商业链路，再修补质感 ⭐ 最重要的优先级原则
   → 不要为了画面好看牺牲产品展示
   → 步骤完整 > 画面美感

3. 开箱场景使用三步物理链
   → "托底推盖 → 翻开盒盖 → 取下平铺"
   → 使用"必须/不得"等强制约束语言

4. 防止人物漂移
   → 明确 character 身份与产品/场景的相对位置
   → 跨镜头锚定细节（穿着、配饰、场景元素）

5. 多批次图片严格隔离
   → 不同色系/版本的产品图片不可混用
   → 一次只做一个 SKU 的视频
\`\`\`

---

## 🛠 R2V Prompt 输出标准结构

\`\`\`markdown
[Reference Images 用途说明]
【图1】= [作用描述，如"角色身份 - 主角正面照"]
【图2】= [作用描述，如"场景参考 - 咖啡店环境"]
【图3】= [作用描述，如"产品参考 - 包装正面"]

[整体描述]
[一句话锁定整片调性]

【镜头1 | 景别/视角 | 运镜方式 | 时长】
[详细画面描述，调用对应参考图]
- 时间/光线：[具体描述]
- 人物动作：[具体动作 + 微表情]
- 产品展示：[必须保留的产品步骤]
- 材质细节：[面料/光泽/质地的视觉锚点]

【镜头2 | ... | ... | ...】
[同上结构]

【镜头3 | ... | ... | ...】
[同上结构]

【镜头4 | ... | ... | ...】
[同上结构]

[Anchor 锚点]
[跨镜头必须保持一致的细节]

[Style 风格]
[一句话风格关键词]

[Negative 排除]
[必要的排除项]
\`\`\`

---

## 🎬 不同场景的 R2V Slot 推荐

### 人物剧情（4-5 张图）
\`\`\`
图1: 主角正面
图2: 主角侧脸（一致性保险）
图3: 配角参考（如有）
图4: 场景参考
图5: 风格/色调参考（电影截图）
\`\`\`

### 电商产品广告（4-6 张图）
\`\`\`
图1: 产品主图（必备）
图2: 产品 45° 角图（多角度）
图3: 产品细节图（材质/Logo）
图4: 模特/手部参考
图5: 使用场景图
图6: 包装盒图（如开箱）
\`\`\`

### 服装服饰（5-7 张图）
\`\`\`
图1: 平铺图
图2-4: 模特正/侧/背三视图
图5: 面料细节图
图6: 配饰参考
图7: 场景参考
\`\`\`

### 故事分镜（按情绪顺序）
\`\`\`
图1-N: 按时间顺序排列的关键画面
（如咖啡制作：豆 → 磨 → 冲 → 成品）
\`\`\`

---

## 💎 R2V 黄金法则（一句话总结）

> **R2V 不是"用图片做视频"，是"用图片+文字共同写一份精确的拍摄说明书"。**
>
> 图片告诉模型「长什么样」
> 文字告诉模型「按什么顺序、怎么动、保留哪些步骤」
>
> 两者缺一不可。
>
> 商业广告：**保留商业链路 > 画面美感**
> 这是最容易踩的坑，也是最重要的原则。

---

## 🔧 当用户使用 R2V 时，skill 该做什么

1. **询问用户上传的每张图的用途**（不要自己猜）
2. **识别使用场景**（4 种写法之一）
3. **如果是电商广告**，加载 \`ecommerce_product_ad.md\` 联合使用
4. **检查商业链路完整性**（产品展示步骤都在吗？）
5. **每个 Shot 标注调用哪些图**（【图1】【图2】格式）
6. **加入跨镜头 Anchor**（防止人物/产品漂移）
7. **强调"必须/不得"约束语言**（不要让 AI 自由删步骤）
`;

export const REF_ECOMMERCE_PRODUCT_AD = `
# 电商产品广告完整指南

> 6 大品类专属方案，每类都有：参考图分工 + Shot 结构 + 完整 Prompt 模板

---

## 📋 电商 vs Luxury 广告核心差异

| 维度 | Luxury | Ecommerce |
|------|--------|-----------|
| 目的 | 品牌情绪 | **直接转化** |
| 产品出现 | 1-2 镜头 | **每个镜头都要在** |
| 节奏 | 慢、留白 | 快、信息密集 |
| 时长 | 15-30s | **8-15s** |
| 必需元素 | 氛围 | **标签 / 卖点 / Pack shot** |
| 真人比重 | 配角 | 主角（演示者）|

---

## 🎬 电商 4 镜头标准结构

\`\`\`
Shot 1 (2-3s): 钩子 — 抓眼球（产品惊艳出场 / 痛点展示）
Shot 2 (3-4s): 使用 — 清晰演示如何用
Shot 3 (3-4s): 卖点 — 强调材质/功能/差异
Shot 4 (3-4s): Pack shot — 产品+品牌+(CTA)
\`\`\`

⚠️ 关键信息**前 3 秒必须出现**——电商用户没耐心。

---

## 🎯 9 Slot 通用分工（按需选用 4-9 个）

\`\`\`
Slot 1: 产品主图（正面官图）⭐ 必备
Slot 2: 产品 45° 角图
Slot 3: 产品细节图（材质/按钮/纹理）
Slot 4: 模特参考图（演示者）
Slot 5: 使用场景图
Slot 6: 色调参考图（品牌色）
Slot 7: 包装盒图（开箱场景需要）
Slot 8: 卖点视觉化图（对比图、效果图）
Slot 9: 备用产品角度
\`\`\`

---

# 📦 6 大品类专属方案

---

## 1. 🧴 美妆护肤

### 重点
**产品质地 + 上脸效果 + Pack shot**

### Happy Horse 强项
- 液体/质地表现极佳（精华滴落、乳霜涂抹）
- 慢节奏特写非常稳

### 弱项 / 注意
- 复杂面部表情避免（V1 易崩）
- 推荐手部 + 颈部演示，不要全脸特写

### 必备 Slot
\`\`\`
@product: 产品瓶身官图
@texture: 质地特写（点泵涂在手背的样子）
@bathroom_or_vanity: 干净浴室场景
@hand: 优雅手部
\`\`\`

### Shot 结构
\`\`\`
Shot 1 (2s): 产品在大理石/木质表面，配品牌标
Shot 2 (4s): 手取产品 → 滴管/点泵 → 滴在手背 / 脸侧
Shot 3 (4s): 极近景质地 → 吸收 → 皮肤微光
Shot 4 (3s): Pack shot + 一支白花/绿叶 + 标签清晰
\`\`\`

### 必备 Anchor
\`\`\`
[ANCHOR]
Product label readable in shots 1, 2, and 4.
Bottle/jar shape consistent.
Skin tone consistent across shots 2-3.
Marble/wood pattern stable in shots 1 and 4.
\`\`\`

### 必备 Negative
\`\`\`
No oversaturated skin tones,
no plastic skin texture,
no over-corrected skin color,
no other beauty brand logos.
\`\`\`

### 风格关键词
\`\`\`
"Premium skincare commercial, clean clinical luxury,
cool ivory palette with warm peachy highlights,
soft morning light, shallow depth of field"
\`\`\`

---

## 2. 👗 服装/配饰

### 重点
**模特动作 + 面料质感 + 多场景搭配**

### Happy Horse 强项
- 面料飘动表现自然
- 慢动作转身、走动稳

### 弱项 / 注意
- 复杂舞蹈、跑跳避免
- 多人配合动作（情侣装）易出错

### 必备 Slot
\`\`\`
@product: 服装平铺图 / 假人模特图
@model: 你想要的模特参考
@scene: 街景 / 室内 / 户外
@detail: 面料/缝线/配饰特写
\`\`\`

### Shot 结构
\`\`\`
Shot 1 (3s): 模特穿着，转身或回眸（中景）
Shot 2 (3s): 走动 / 风吹起裙摆（动态展示）
Shot 3 (4s): 极近景面料质感 + 缝线 + 配件
Shot 4 (3s): 多角度产品平铺 + 颜色款式展示 + 标签
\`\`\`

### 必备 Anchor
\`\`\`
[ANCHOR]
Garment color and pattern consistent across all shots.
Model's accessories stay the same (jewelry, shoes).
Fabric texture readable in close-ups.
\`\`\`

### 必备 Negative
\`\`\`
No fast running, no complex dancing,
no oversaturated colors,
no other fashion brand logos visible,
no costume that looks like a costume.
\`\`\`

### 风格关键词
\`\`\`
"Fashion editorial commercial, natural light,
warm honey or cool teal palette,
35mm lens feel, model walks with intention"
\`\`\`

---

## 3. 📱 数码电子

### 重点
**多角度展示 + 功能演示 + 卖点强化**

### Happy Horse 强项
- 科技感光线（LED、屏幕反光）表现好
- 静态产品多角度切换稳

### 弱项 / 注意
- 屏幕内容（UI 显示）容易乱
- 复杂手势操作（捏、滑、双击）易崩

### 必备 Slot
\`\`\`
@product: 产品官图（含包装/充电盒）
@product_open: 打开/拆解状态
@detail: 接口/按钮/触控点细节
@scene: 现代办公桌 / 床头 / 包内
@hand: 手部参考
\`\`\`

### Shot 结构
\`\`\`
Shot 1 (2s): 产品静态hero（带 LED/屏幕亮起的瞬间）
Shot 2 (3s): 手取产品 → 打开 / 启动 → LED 亮
Shot 3 (4s): 多个快切镜头展示卖点（电池/降噪/传感器）
Shot 4 (4s): Pack shot + 关键数据浮现（"40H · ANC · IPX5"）
\`\`\`

### 必备 Anchor
\`\`\`
[ANCHOR]
Brand logo readable in shots 1, 2, and 4.
LED color stays [颜色] in all shots.
Product shape and color consistent.
Phone screen UI consistent (if visible).
Button layout doesn't change.
\`\`\`

### 必备 Negative
\`\`\`
No competing brand logos,
no fake UI elements,
no neon glow effects,
no oversaturated colors,
no cluttered desk.
\`\`\`

### 风格关键词
\`\`\`
"Premium tech product commercial,
clean futuristic minimalist aesthetic,
cool white-blue palette with warm wood accents,
crisp focus, fast tech rhythm"
\`\`\`

### 数码品类细分

\`\`\`
耳机/音响: 重点 LED + 充电盒动作 + 入耳手势
手机配件: 重点接口 + 适配感 + 充电动画
智能穿戴: 重点屏幕显示 + 佩戴感
键鼠周边: 重点按键反馈 + 灯效
充电设备: 重点指示灯 + 多设备适配
摄影器材: 重点拨盘转动 + 镜头光斑
\`\`\`

---

## 4. 🍰 食品饮料

### 重点
**诱人的近景 + 制作/食用过程**

### Happy Horse 强项
- 慢节奏倾倒、切片、淋酱 = 杀手锏
- 蒸汽、起酥、巧克力流动表现极佳

### 弱项 / 注意
- 复杂烹饪过程会跳帧
- 多人围桌吃饭场景易崩

### 必备 Slot
\`\`\`
@product: 包装产品图
@dish: 摆盘成品图
@ingredients: 关键食材图
@texture: 切开/淋汁/拉丝特写
\`\`\`

### Shot 结构
\`\`\`
Shot 1 (2s): 包装产品 + 关键食材在桌面
Shot 2 (4s): 慢镜头 — 切开 / 淋汁 / 倒水 / 蒸汽升起
Shot 3 (4s): 极近景质感 — 拉丝 / 流心 / 气泡
Shot 4 (3s): 摆盘成品 + 包装并排 + 品牌+卖点文字
\`\`\`

### 必备 Anchor
\`\`\`
[ANCHOR]
Product packaging label readable in shots 1 and 4.
Food color and texture consistent.
Plate/bowl color stays the same.
Lighting source unchanged across shots.
\`\`\`

### 必备 Negative
\`\`\`
No oversaturated food colors,
no fake-looking shine on food,
no cluttered table,
no other food brand logos.
\`\`\`

### 风格关键词
\`\`\`
"Premium food commercial,
warm appetizing tones, soft natural light,
shallow depth of field on food details,
slight steam visible, fresh and inviting"
\`\`\`

---

## 5. 🛋 家居用品

### 重点
**使用场景 + 空间感 + 材质质感**

### Happy Horse 强项
- 静态家具 + 缓慢镜头扫过 = 表现稳
- 灯光氛围切换好

### 弱项 / 注意
- 避免人物在家具上的复杂互动（坐下、躺下、起身组合动作）
- 复杂室内移动场景易崩

### 必备 Slot
\`\`\`
@product: 家居产品图
@scene: 完整空间场景图（房间/客厅/卧室）
@detail: 材质/工艺细节
@usage: 使用瞬间图（手放在沙发上、插上插头等单一动作）
\`\`\`

### Shot 结构
\`\`\`
Shot 1 (3s): 空间全景，产品在场景中（中远景）
Shot 2 (3s): 慢推近 → 产品细节
Shot 3 (3s): 单一使用动作 — 手抚摸 / 开灯 / 调节
Shot 4 (4s): 产品独立 hero shot + 品牌 + 关键卖点
\`\`\`

### 必备 Anchor
\`\`\`
[ANCHOR]
Furniture color and material consistent.
Room layout doesn't change between shots.
Light source position stays the same.
Surrounding decor consistent.
\`\`\`

### 必备 Negative
\`\`\`
No people fully entering the scene,
no complex movement in furniture,
no other household brand logos,
no messy room.
\`\`\`

### 风格关键词
\`\`\`
"Premium home product commercial,
warm cozy palette, soft natural light from window,
inviting atmosphere, slow contemplative pacing"
\`\`\`

---

## 6. 🏃 运动/户外

### ⚠️ Happy Horse 不推荐这个品类

\`\`\`
原因：
- Happy Horse V1 的武打/复杂动作弱
- 跑步、瑜伽、骑行等动作链易崩

推荐替代：
- SeaDance 1.5 Pro（运动专家）
- Seedance 2.0（运动+广告感平衡）
- Runway Act Two（动作迁移）
\`\`\`

### 但如果坚持用 Happy Horse

降低复杂度：
\`\`\`
✅ 可做：
- 静态产品 hero shot
- 慢动作单一动作（举哑铃一次、伸展一次）
- 装备特写 + 材质展示

❌ 避免：
- 跑步动作
- 瑜伽连贯动作
- 骑行 / 攀岩 / 球类
- 团队配合场景
\`\`\`

### Shot 结构（简化版）
\`\`\`
Shot 1 (3s): 产品静态展示（鞋/装备）
Shot 2 (3s): 慢动作单一动作（手持装备、穿戴瞬间）
Shot 3 (3s): 装备细节 / 科技亮点
Shot 4 (4s): Pack shot + 卖点
\`\`\`

---

# 🛠 完整通用 Negative 模板（电商通用）

\`\`\`
[NEGATIVE - 电商通用]
No watermarks, no subtitles, no extra captions during shots.
No competing brand logos.
No background music until pack shot.
No oversaturated colors, no Instagram filter look.
No plastic surface artifacts on product.
No cluttered scenes.
No fake UI elements.
No imaginary specifications or fake data.
[BRAND] is the only logo and text in frame.
\`\`\`

---

# 📐 不同电商平台尺寸建议

| 平台 | 推荐比例 | 时长 |
|------|---------|------|
| 淘宝/天猫详情页 | 16:9 | 13-30s |
| 抖音电商 | 9:16 | 8-15s |
| 小红书 | 4:5 或 9:16 | 12-20s |
| Amazon Posts | 1:1 | 8-12s |
| TikTok Shop | 9:16 | 8-15s |
| Instagram Shop | 1:1 / 4:5 | 8-15s |

⚠️ 一般生成 16:9 主版本 → 后期裁剪成多版本

---

# 💎 电商专属 6 个常见坑

\`\`\`
1. Pack shot 标签错乱
   解：Anchor 必加 "label readable in shots X, X"
   PS 修比重 roll 快

2. 多角度产品不一致
   解：至少给 2 张不同角度参考图

3. 模特过度抢戏
   解：每 Shot 末尾"camera ends on product"

4. 时长太长用户跑路
   解：< 15s，关键信息前 3 秒必现

5. 没有 CTA 暗示
   解：Shot 4 加"label centered, ready to scan"

6. 调色过于"luxury"
   解：电商需要明亮、清晰、透气
   不要"crushed velvet shadow"
\`\`\`

---

# 🎯 电商品类自动选择逻辑

skill 调用时识别用户提到的产品：

\`\`\`
用户说"美容/护肤/精华/面霜/口红/眼影" → 美妆护肤
用户说"衣服/裙子/包包/鞋子/配饰/首饰" → 服装配饰
用户说"耳机/手机/电脑/键盘/充电器" → 数码电子
用户说"咖啡/茶/酒/零食/烘焙/调味" → 食品饮料
用户说"沙发/床/灯/桌/收纳/家纺" → 家居用品
用户说"跑鞋/瑜伽/健身/户外/运动装备" → 运动户外
\`\`\`

每个品类自动调用对应的 Shot 结构 + Anchor + Negative。

---

**核心心法：**
> **电商广告 = 产品是绝对主角 + 节奏要快 + 标签清晰 + Pack shot 必须**
>
> 不要做成 luxury 广告，也不要做成 vlog。
> 用户的目标是「看完就想买」。
`;


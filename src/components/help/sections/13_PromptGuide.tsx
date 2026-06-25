import { HelpSection, H3 } from "../HelpSection";
import { Callout } from "../ui/Callout";
import { SpecTable } from "../ui/SpecTable";
import { CodeBlock } from "../ui/CodeBlock";

export function Sec13PromptGuide() {
  return (
    <HelpSection id="prompt-guide" no="13" title="提示词指南" group="创作辅助">
      <p className="lead">
        从&quot;随便写写&quot;进化为&quot;精确控制生成画面&quot;的系统化方法论。本节是简化版；
        完整深度内容（含范例库）在 <a href="/guide">/guide</a> 页（Happy Horse Prompt Guide V3 静态版）。
      </p>

      <H3 id="prompt-five">五要素框架</H3>
      <p>
        所有 Frame/0 推荐的 prompt 结构都基于这五个维度，缺一不可：
      </p>
      <SpecTable
        headers={["维度", "回答的问题", "示范"]}
        rows={[
          ["主体 Subject", "镜头里的主角是什么 / 谁？", "穿米色风衣的亚洲女性，30 岁，黑色波浪长发"],
          ["动作 Action", "主角在做什么？", "缓慢转过头看向镜头，嘴角微微上扬"],
          ["场景 Scene", "在什么环境里？", "黄昏的东京街头，霓虹灯刚开始亮，地面湿润反光"],
          ["镜头 Camera", "镜头怎么拍 / 怎么动？", "中近景，缓慢推近 (slow push-in)，浅景深"],
          ["氛围 Atmosphere", "整体感觉 / 情绪", "电影感冷调，宁静中带忧郁，王家卫风"],
        ]}
      />

      <Callout type="tip" title="顺序很重要">
        <p>
          推荐顺序：<strong>主体 → 动作 → 场景 → 镜头 → 氛围</strong>。
          AI 视频模型对前几句的权重最高，把最重要的（主体长什么样、做什么）放前面。
          氛围词放最后，让它做整体&quot;调味&quot;。
        </p>
      </Callout>

      <H3 id="prompt-camera">镜头语法速查</H3>
      <SpecTable
        headers={["术语", "效果", "英文写法"]}
        rows={[
          ["推 / push-in", "镜头向主体靠近，缩小可视范围", "slow push-in / dolly forward"],
          ["拉 / pull-out", "镜头远离主体，展现更大场景", "slow pull-out / dolly backward"],
          ["摇 / pan", "镜头左右水平转动", "pan left / pan right"],
          ["移 / truck", "镜头平行平移（保持距离）", "truck left / truck right"],
          ["跟 / follow", "跟随主体运动", "follow shot / tracking shot"],
          ["升 / crane up", "镜头垂直上升", "crane up / boom up"],
          ["降 / crane down", "镜头垂直下降", "crane down / boom down"],
          ["旋转 / orbit", "围绕主体环绕", "orbit clockwise / 360 spin"],
          ["定点 / locked-off", "完全静止不动", "locked-off camera / static shot"],
          ["手持 / handheld", "轻微抖动模拟手持质感", "handheld / shaky cam"],
        ]}
      />

      <H3 id="prompt-template">通用 prompt 骨架</H3>
      <CodeBlock title="可直接套用的模板" lang="prompt">
{`[主体描述]，[身份/服装/外观细节]，
出现在 [场景/环境描述]，时间 [具体时段]。

[主体的具体动作]，[互动细节]。

镜头：[运镜方式]，[景别]，[景深]，[特殊视角]。
持续 [N] 秒。

氛围：[情绪基调]，[色温/色调]，[参考风格/导演/作品]。

Negative: [禁止出现的元素]`}
      </CodeBlock>

      <H3 id="prompt-failures">常见失败模式 & 修补</H3>
      <SpecTable
        headers={["症状", "可能原因", "修补 prompt"]}
        rows={[
          ["人物变形", "主体描述不够具体 / 参考图缺失",
           "增加 5 要素中 character + identity 字段；R2V 加 character 参考图"],
          ["运镜抖动", "镜头描述用了 &quot;handheld&quot;",
           "改成 &quot;locked-off camera, smooth motion, stabilized&quot;"],
          ["风格漂移", "氛围词太弱 / 多个风格混用",
           "选 1 个风格 anchor (如&quot;like a Wong Kar-wai film&quot;)，把其他风格词全删"],
          ["多余肢体", "复杂动作描述",
           "把动作拆成单一动作（去掉&quot;同时...&quot;描述），Negative 加 &quot;extra limbs&quot;"],
          ["AI 怪脸", "复杂表情描述",
           "改成 &quot;neutral expression, looking at camera, calm&quot;；Negative 加 &quot;uncanny faces&quot;"],
          ["背景闪烁 / 元素跳", "场景元素太多",
           "简化背景描述，加 &quot;static background, no moving elements behind&quot;"],
          ["产品比例失真", "缺产品参考图",
           "R2V 加 product 参考图；Negative 加 &quot;warped product, distorted proportions&quot;"],
          ["塑料感 / CGI 假", "默认渲染问题",
           "Prompt 加 &quot;photorealistic, real material, natural lighting&quot;；Negative 加 &quot;CGI, plastic shine&quot;"],
        ]}
      />

      <H3 id="prompt-negative">Negative Prompt 万用模板</H3>
      <p>
        Negative prompt 是&quot;告诉模型不要出现什么&quot;。比正向描述更有效避开常见缺陷。
        以下是覆盖 90% 场景的通用 negative：
      </p>
      <CodeBlock title="通用 Negative" lang="negative">
{`warped product, distorted proportions, twisted body,
plastic shine, CGI over-rendering, fake materials,
uncanny faces, extra limbs, multiple heads, blurred face,
garbled text, fake brand name, watermark, low resolution,
lens flare excess, motion blur on still product`}
      </CodeBlock>

      <H3 id="prompt-references">深度资源</H3>
      <ul>
        <li><a href="/guide">/guide</a> — Happy Horse Prompt Guide V3 完整版（含 50+ 范例库）</li>
        <li><a href="#director-cinematic">07 单镜大片</a> — 34 个场景 preset 自动生成 prompt</li>
        <li><a href="#discover">14 灵感发现</a> — 一键引用他人优秀作品的 prompt</li>
        <li><a href="#file-bridge">16 文件桥</a> — 用 Claude Code skill 自动写 prompt</li>
      </ul>
    </HelpSection>
  );
}

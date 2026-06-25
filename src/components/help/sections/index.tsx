import type { TOCEntry } from "../HelpTOC";
import type { FC } from "react";

import { Sec01Overview } from "./01_Overview";
import { Sec02QuickStart } from "./02_QuickStart";
import { Sec03ImageGen } from "./03_ImageGen";
import { Sec04VideoGen } from "./04_VideoGen";
import { Sec05ModelMatrix } from "./05_ModelMatrix";
import { Sec06DirectorOverview } from "./06_DirectorOverview";
import { Sec07DirectorCinematic } from "./07_DirectorCinematic";
import { Sec08DirectorUGC } from "./08_DirectorUGC";
import { Sec09LongVideoChain } from "./09_LongVideoChain";
import { Sec10Editor } from "./10_Editor";
import { Sec11Compare } from "./11_Compare";
import { Sec12Archive } from "./12_Archive";
import { Sec13PromptGuide } from "./13_PromptGuide";
import { Sec14Discover } from "./14_Discover";
import { Sec15Persistence } from "./15_Persistence";
import { Sec16FileBridge } from "./16_FileBridge";
import { Sec17Limits } from "./17_Limits";
import { Sec18FAQ } from "./18_FAQ";
import { Sec19Glossary } from "./19_Glossary";
import { Sec20Shortcuts } from "./20_Shortcuts";
import { Sec21Roadmap } from "./21_Roadmap";
import { Sec22About } from "./22_About";
import { Sec23Canvas } from "./23_Canvas";

export const ALL_SECTIONS: FC[] = [
  Sec01Overview, Sec02QuickStart,
  Sec03ImageGen, Sec04VideoGen, Sec05ModelMatrix,
  Sec23Canvas,
  Sec06DirectorOverview, Sec07DirectorCinematic, Sec08DirectorUGC, Sec09LongVideoChain,
  Sec10Editor, Sec11Compare, Sec12Archive,
  Sec13PromptGuide, Sec14Discover,
  Sec15Persistence, Sec16FileBridge,
  Sec17Limits, Sec18FAQ, Sec19Glossary, Sec20Shortcuts,
  Sec21Roadmap, Sec22About,
];

export const TOC_ENTRIES: TOCEntry[] = [
  {
    group: "入门",
    items: [
      { id: "overview",    no: "01", title: "产品概览" },
      { id: "quickstart",  no: "02", title: "快速开始" },
    ],
  },
  {
    group: "生成能力",
    items: [
      { id: "image-gen",    no: "03", title: "AI 生图" },
      { id: "video-gen",    no: "04", title: "AI 生视频" },
      { id: "model-matrix", no: "05", title: "模型矩阵" },
    ],
  },
  {
    group: "画布 Canvas",
    items: [
      { id: "canvas", no: "✦", title: "节点式画布" },
    ],
  },
  {
    group: "导演台 R2V",
    items: [
      { id: "director-overview",  no: "06", title: "工作流概览" },
      { id: "director-cinematic", no: "07", title: "单镜大片（Cinematic）" },
      { id: "director-ugc",       no: "08", title: "批量短片（UGC）" },
      { id: "long-video-chain",   no: "09", title: "长视频链式生成" },
    ],
  },
  {
    group: "后期与归档",
    items: [
      { id: "editor",  no: "10", title: "多轨剪辑" },
      { id: "compare", no: "11", title: "对比台" },
      { id: "archive", no: "12", title: "档案中心" },
    ],
  },
  {
    group: "创作辅助",
    items: [
      { id: "prompt-guide", no: "13", title: "提示词指南" },
      { id: "discover",     no: "14", title: "灵感发现" },
    ],
  },
  {
    group: "数据与集成",
    items: [
      { id: "persistence", no: "15", title: "数据持久化" },
      { id: "file-bridge", no: "16", title: "文件桥与 Skill" },
    ],
  },
  {
    group: "运维参考",
    items: [
      { id: "limits",    no: "17", title: "系统限制" },
      { id: "faq",       no: "18", title: "FAQ / 故障排查" },
      { id: "glossary",  no: "19", title: "术语表" },
      { id: "shortcuts", no: "20", title: "快捷键全表" },
    ],
  },
  {
    group: "关于",
    items: [
      { id: "roadmap", no: "21", title: "路线图与边界" },
      { id: "about",   no: "22", title: "关于 Frame/0" },
    ],
  },
];

import type { Source } from "./types";

export const sourceGroups = {
  public: "学校公共信息渠道",
  academic: "学院 / 学部信息渠道"
} as const;

export const sources: Source[] = [
  { id: "hit-today", name: "今日哈工大", group: "public", category: "public", status: "active", url: "https://ca.hit.edu.cn/xxxt/ggxxfwtx/jrhgdwz/jrhgd1.htm", enabled: true, parserType: "today-hit" },
  { id: "hit-news", name: "哈工大新闻网", group: "public", category: "public", status: "active", url: "https://news.hit.edu.cn/", enabled: true, parserType: "generic" },
  { id: "undergraduate", name: "本科生院", group: "public", category: "public", status: "active", url: "https://hituc.hit.edu.cn/17860/list.htm", enabled: true, parserType: "generic" },
  { id: "graduate", name: "研究生院", group: "public", category: "public", status: "active", url: "https://hitgs.hit.edu.cn/tzgg/list.htm", enabled: true, parserType: "generic" },
  { id: "astronautics", name: "航天学院", group: "academic", category: "school", status: "active", url: "https://sa.hit.edu.cn/tzgg_6582/list.htm", enabled: true, parserType: "generic" },
  { id: "electronics-info", name: "电子与信息工程学院", group: "academic", category: "school", status: "active", url: "https://seie.hit.edu.cn/xygg/list.htm", enabled: true, parserType: "generic" },
  { id: "mechatronics", name: "机电工程学院", group: "academic", category: "school", status: "active", url: "https://sme.hit.edu.cn/18013/list2.htm", enabled: true, parserType: "generic" },
  { id: "materials", name: "材料科学与工程学院", group: "academic", category: "school", status: "active", url: "https://mse.hit.edu.cn/16847/list.htm", enabled: true, parserType: "generic" },
  { id: "energy", name: "能源科学与工程学院", group: "academic", category: "school", status: "active", url: "https://power.hit.edu.cn/5714/list.htm", enabled: true, parserType: "generic" },
  { id: "electrical", name: "电气工程及自动化学院", group: "academic", category: "school", status: "active", url: "https://hitee.hit.edu.cn/17101/list.htm", enabled: true, parserType: "generic" },
  { id: "instrument", name: "仪器科学与工程学院", group: "academic", category: "school", status: "active", url: "https://ise.hit.edu.cn/5304/list.htm", enabled: true, parserType: "generic" },
  { id: "math", name: "数学学院", group: "academic", category: "school", status: "active", url: "https://math.hit.edu.cn/10232/list.htm", enabled: true, parserType: "generic" },
  { id: "physics", name: "物理学院", group: "academic", category: "school", status: "active", url: "https://physics.hit.edu.cn/12332/list.htm", enabled: true, parserType: "generic" },
  { id: "management", name: "经济与管理学院", group: "academic", category: "school", status: "active", url: "https://som.hit.edu.cn/index/tzgg1.htm", enabled: true, parserType: "generic" },
  { id: "business", name: "商学院", group: "academic", category: "school", status: "active", url: "https://hbs.hit.edu.cn/xwzx/tzgg1.htm", enabled: true, parserType: "generic" },
  { id: "humanities", name: "人文社科学部", group: "academic", category: "school", status: "active", url: "https://rwskxb.hit.edu.cn/tzgg/list.htm", enabled: true, parserType: "generic" },
  { id: "marxism", name: "马克思主义学院", group: "academic", category: "school", status: "active", url: "https://marx.hit.edu.cn/tzgg/list.htm", enabled: true, parserType: "generic" },
  { id: "civil", name: "土木工程学院", group: "academic", category: "school", status: "active", url: "https://civil.hit.edu.cn/8439/list.htm", enabled: true, parserType: "generic" },
  { id: "environment", name: "环境学院", group: "academic", category: "school", status: "active", url: "https://env.hit.edu.cn/8344/list.htm", enabled: true, parserType: "generic" },
  { id: "architecture-design", name: "建筑与设计学院", group: "academic", category: "school", status: "active", url: "https://arch.hit.edu.cn/11953/list.htm", enabled: true, parserType: "generic" },
  { id: "transportation", name: "交通科学与工程学院", group: "academic", category: "school", status: "active", url: "https://jtxy.hit.edu.cn/tzgg/list.htm", enabled: true, parserType: "generic" },
  { id: "computing", name: "计算学部", group: "academic", category: "school", status: "active", url: "https://computing.hit.edu.cn/11271/list.htm", enabled: true, parserType: "generic" },
  { id: "chemistry", name: "化学与化工学院", group: "academic", category: "school", status: "active", url: "https://chemeng.hit.edu.cn/tzgg/list.htm", enabled: true, parserType: "generic" },
  { id: "medicine-health", name: "医学与健康学院", group: "academic", category: "school", status: "active", url: "https://med.hit.edu.cn/12995/list.htm", enabled: true, parserType: "generic" },
  { id: "life-science", name: "生命科学与技术学院", group: "academic", category: "school", status: "active", url: "https://life.hit.edu.cn/ggkx/list.htm", enabled: true, parserType: "generic" },
  { id: "future-tech", name: "未来技术学院", group: "academic", category: "school", status: "active", url: "https://future.hit.edu.cn/16314/list.htm", enabled: true, parserType: "generic" }
];

export const publicSources = sources.filter((source) => source.group === "public");
export const academicSources = sources.filter((source) => source.group === "academic");

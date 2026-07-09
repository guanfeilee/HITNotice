import type { CrawlSourceType } from "@/lib/crawler/types";
import type { SourceCategory, SourceGroup, SourceParserType, SourceStatus } from "@/lib/types";

export type SourceRegistryEntry = {
  id: string;
  name: string;
  group: SourceGroup;
  category: SourceCategory;
  status: SourceStatus;
  url: string;
  baseUrl: string;
  enabled: boolean;
  parserType: SourceParserType;
  titleSelector?: string;
  crawlCategory: string;
  crawlType: CrawlSourceType;
};

export const sourceRegistry = [
  {
    id: "today",
    name: "今日哈工大",
    group: "public",
    category: "public",
    status: "active",
    url: "https://today.hit.edu.cn/category/10",
    baseUrl: "https://today.hit.edu.cn",
    enabled: true,
    parserType: "today-hit",
    crawlCategory: "学校通知",
    crawlType: "school"
  },
  {
    id: "news",
    name: "哈工大新闻网",
    group: "public",
    category: "public",
    status: "active",
    url: "https://news.hit.edu.cn/xxyw/list.htm",
    baseUrl: "https://news.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学校新闻",
    crawlType: "news"
  },
  {
    id: "undergraduate",
    name: "本科生院",
    group: "public",
    category: "public",
    status: "active",
    url: "https://hituc.hit.edu.cn/17860/list.htm",
    baseUrl: "https://hituc.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    titleSelector: ".news_title",
    crawlCategory: "教务/本科",
    crawlType: "undergraduate"
  },
  {
    id: "postgraduate",
    name: "研究生院",
    group: "public",
    category: "public",
    status: "active",
    url: "https://hitgs.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://hitgs.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "研究生",
    crawlType: "graduate"
  },
  {
    id: "aerospace",
    name: "航天学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://sa.hit.edu.cn/tzgg_6582/list.htm",
    baseUrl: "https://sa.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "electronic",
    name: "电子与信息工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://seie.hit.edu.cn/xygg/list.htm",
    baseUrl: "https://seie.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "machine",
    name: "机电工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://sme.hit.edu.cn/18013/list1.htm",
    baseUrl: "https://sme.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "material",
    name: "材料科学与工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://mse.hit.edu.cn/16847/list.htm",
    baseUrl: "https://mse.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "resource",
    name: "能源科学与工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://power.hit.edu.cn/5714/list.htm",
    baseUrl: "https://power.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "electrical",
    name: "电气工程及自动化学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://hitee.hit.edu.cn/17101/list.htm",
    baseUrl: "https://hitee.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "instrument",
    name: "仪器科学与工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://ise.hit.edu.cn/5304/list.htm",
    baseUrl: "https://ise.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "math",
    name: "数学学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://math.hit.edu.cn/10232/list.htm",
    baseUrl: "https://math.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "physics",
    name: "物理学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://physics.hit.edu.cn/12332/list.htm",
    baseUrl: "https://physics.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "management",
    name: "经济与管理学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://som.hit.edu.cn/index/tzgg1.htm",
    baseUrl: "https://som.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    titleSelector: ".gl-intr h3 a",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "finance",
    name: "商学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://hbs.hit.edu.cn/xwzx/tzgg1.htm",
    baseUrl: "https://hbs.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    titleSelector: ".list-right .xw-ul > li .xw-ul-tt",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "marx",
    name: "马克思主义学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://marx.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://marx.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "social",
    name: "人文社科学部",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://rwskxb.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://rwskxb.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "civil",
    name: "土木工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://civil.hit.edu.cn/8439/list.htm",
    baseUrl: "https://civil.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "environment",
    name: "环境学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://env.hit.edu.cn/8344/list.htm",
    baseUrl: "https://env.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "architecture",
    name: "建筑学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://arch.hit.edu.cn/11953/list.htm",
    baseUrl: "https://arch.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "traffic",
    name: "交通科学与工程学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://jtxy.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://jtxy.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "computer",
    name: "计算学部",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://computing.hit.edu.cn/11271/list.htm",
    baseUrl: "https://computing.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "chem",
    name: "化学与化工学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://chemeng.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://chemeng.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "med",
    name: "医学与健康学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://med.hit.edu.cn/12995/list.htm",
    baseUrl: "https://med.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "life",
    name: "生命科学与技术学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://life.hit.edu.cn/ggkx/list.htm",
    baseUrl: "https://life.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  },
  {
    id: "future",
    name: "未来技术学院",
    group: "academic",
    category: "school",
    status: "active",
    url: "https://future.hit.edu.cn/16314/list.htm",
    baseUrl: "https://future.hit.edu.cn",
    enabled: true,
    parserType: "generic",
    crawlCategory: "学院/学部",
    crawlType: "college"
  }
] as const satisfies readonly SourceRegistryEntry[];

export const sourceRegistryById = new Map(sourceRegistry.map((source) => [source.id, source]));

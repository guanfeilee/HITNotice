import type { CrawlSource } from "@/lib/crawler/types";

export const crawlSources: CrawlSource[] = [
  {
    id: "today-hit",
    name: "今日哈工大",
    url: "https://today.hit.edu.cn/category/10",
    baseUrl: "https://today.hit.edu.cn",
    category: "学校通知",
    type: "school"
  },
  {
    id: "hit-news",
    name: "哈工大新闻网",
    url: "https://news.hit.edu.cn/xxyw/list.htm",
    baseUrl: "https://news.hit.edu.cn",
    category: "学校新闻",
    type: "news"
  },
  {
    id: "hit-undergraduate",
    name: "本科生院",
    url: "https://hituc.hit.edu.cn/17860/list.htm",
    baseUrl: "https://hituc.hit.edu.cn",
    category: "教务/本科",
    type: "undergraduate"
  },
  {
    id: "hit-graduate-school",
    name: "研究生院",
    url: "https://hitgs.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://hitgs.hit.edu.cn",
    category: "研究生",
    type: "graduate"
  },
  {
    id: "sa",
    name: "航天学院",
    url: "https://sa.hit.edu.cn/tzgg_6582/list.htm",
    baseUrl: "https://sa.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "seie",
    name: "电子与信息工程学院",
    url: "https://seie.hit.edu.cn/xygg/list.htm",
    baseUrl: "https://seie.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "sme",
    name: "机电工程学院",
    url: "https://sme.hit.edu.cn/18013/list2.htm",
    baseUrl: "https://sme.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "mse",
    name: "材料科学与工程学院",
    url: "https://mse.hit.edu.cn/16847/list.htm",
    baseUrl: "https://mse.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "power",
    name: "能源科学与工程学院",
    url: "https://power.hit.edu.cn/5714/list.htm",
    baseUrl: "https://power.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "hitee",
    name: "电气工程及自动化学院",
    url: "https://hitee.hit.edu.cn/17101/list.htm",
    baseUrl: "https://hitee.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "ise",
    name: "仪器科学与工程学院",
    url: "https://ise.hit.edu.cn/5304/list.htm",
    baseUrl: "https://ise.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "math",
    name: "数学学院",
    url: "https://math.hit.edu.cn/10232/list.htm",
    baseUrl: "https://math.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "physics",
    name: "物理学院",
    url: "https://physics.hit.edu.cn/12332/list.htm",
    baseUrl: "https://physics.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "som",
    name: "经济与管理学院",
    url: "https://som.hit.edu.cn/index/tzgg1.htm",
    baseUrl: "https://som.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "hbs",
    name: "商学院",
    url: "https://hbs.hit.edu.cn/xwzx/tzgg1.htm",
    baseUrl: "https://hbs.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "rwskxb",
    name: "人文社科学部",
    url: "https://rwskxb.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://rwskxb.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "marx",
    name: "马克思主义学院",
    url: "https://marx.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://marx.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "civil",
    name: "土木工程学院",
    url: "https://civil.hit.edu.cn/8439/list.htm",
    baseUrl: "https://civil.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "env",
    name: "环境学院",
    url: "https://env.hit.edu.cn/8344/list.htm",
    baseUrl: "https://env.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "arch",
    name: "建筑与设计学院",
    url: "https://arch.hit.edu.cn/11953/list.htm",
    baseUrl: "https://arch.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "jtxy",
    name: "交通科学与工程学院",
    url: "https://jtxy.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://jtxy.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "computing",
    name: "计算学部",
    url: "https://computing.hit.edu.cn/11271/list.htm",
    baseUrl: "https://computing.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "chemeng",
    name: "化学与化工学院",
    url: "https://chemeng.hit.edu.cn/tzgg/list.htm",
    baseUrl: "https://chemeng.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "med",
    name: "医学与健康学院",
    url: "https://med.hit.edu.cn/12995/list.htm",
    baseUrl: "https://med.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "life",
    name: "生命科学与技术学院",
    url: "https://life.hit.edu.cn/ggkx/list.htm",
    baseUrl: "https://life.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  },
  {
    id: "future",
    name: "未来技术学院",
    url: "https://future.hit.edu.cn/16314/list.htm",
    baseUrl: "https://future.hit.edu.cn",
    category: "学院/学部",
    type: "college"
  }
];

/**
 * 把 4/eda/data/countries.csv 转成前端用的紧凑 JSON。
 * 每个国家一条记录，四个指标按年份对齐成数组，缺值写 null。
 *
 * 用法：node build_data.js
 * 依赖：../2/nl2vis/node_modules/d3-dsv（仓库里已有）
 */
const fs = require('fs');
const path = require('path');
const d3 = require('../2/nl2vis/node_modules/d3-dsv');

const SRC = path.join(__dirname, '..', '4', 'eda', 'data', 'countries.csv');
const OUT = path.join(__dirname, 'data', 'countries.json');
const OUT_JS = path.join(__dirname, 'data', 'countries.js');

const YEARS = Array.from({ length: 60 }, (_, i) => 1960 + i);
const yearIndex = new Map(YEARS.map((y, i) => [y, i]));

const REGION_ZH = {
  'East Asia & Pacific': '东亚与太平洋',
  'Europe & Central Asia': '欧洲与中亚',
  'Latin America & Caribbean': '拉丁美洲与加勒比',
  'Middle East & North Africa': '中东与北非',
  'North America': '北美',
  'South Asia': '南亚',
  'Sub-Saharan Africa': '撒哈拉以南非洲',
};

const INCOME_ZH = {
  'High income': '高收入',
  'Upper middle income': '中等偏上',
  'Lower middle income': '中等偏下',
  'Low income': '低收入',
};

// World Bank 的国家名带 "Arab Rep." 之类的后缀，中文显示统一按国家代码映射
const NAME_ZH = {
  ABW: '阿鲁巴', AFG: '阿富汗', AGO: '安哥拉', ALB: '阿尔巴尼亚', ARE: '阿联酋',
  ARG: '阿根廷', ARM: '亚美尼亚', ATG: '安提瓜和巴布达', AUS: '澳大利亚', AUT: '奥地利',
  AZE: '阿塞拜疆', BDI: '布隆迪', BEL: '比利时', BEN: '贝宁', BFA: '布基纳法索',
  BGD: '孟加拉国', BGR: '保加利亚', BHR: '巴林', BHS: '巴哈马', BIH: '波黑',
  BLR: '白俄罗斯', BLZ: '伯利兹', BMU: '百慕大', BOL: '玻利维亚', BRA: '巴西',
  BRB: '巴巴多斯', BRN: '文莱', BTN: '不丹', BWA: '博茨瓦纳', CAF: '中非',
  CAN: '加拿大', CHE: '瑞士', CHI: '海峡群岛', CHL: '智利', CHN: '中国',
  CIV: '科特迪瓦', CMR: '喀麦隆', COD: '刚果（金）', COG: '刚果（布）', COL: '哥伦比亚',
  COM: '科摩罗', CPV: '佛得角', CRI: '哥斯达黎加', CUB: '古巴', CUW: '库拉索',
  CYM: '开曼群岛', CYP: '塞浦路斯', CZE: '捷克', DEU: '德国', DJI: '吉布提',
  DMA: '多米尼克', DNK: '丹麦', DOM: '多米尼加', DZA: '阿尔及利亚', ECU: '厄瓜多尔',
  EGY: '埃及', ERI: '厄立特里亚', ESP: '西班牙', EST: '爱沙尼亚', ETH: '埃塞俄比亚',
  FIN: '芬兰', FJI: '斐济', FRA: '法国', FRO: '法罗群岛', FSM: '密克罗尼西亚',
  GAB: '加蓬', GBR: '英国', GEO: '格鲁吉亚', GHA: '加纳', GIN: '几内亚',
  GMB: '冈比亚', GNB: '几内亚比绍', GNQ: '赤道几内亚', GRC: '希腊', GRD: '格林纳达',
  GRL: '格陵兰', GTM: '危地马拉', GUM: '关岛', GUY: '圭亚那', HKG: '中国香港',
  HND: '洪都拉斯', HRV: '克罗地亚', HTI: '海地', HUN: '匈牙利', IDN: '印度尼西亚',
  IMN: '马恩岛', IND: '印度', IRL: '爱尔兰', IRN: '伊朗', IRQ: '伊拉克',
  ISL: '冰岛', ISR: '以色列', ITA: '意大利', JAM: '牙买加', JOR: '约旦',
  JPN: '日本', KAZ: '哈萨克斯坦', KEN: '肯尼亚', KGZ: '吉尔吉斯斯坦', KHM: '柬埔寨',
  KIR: '基里巴斯', KNA: '圣基茨和尼维斯', KOR: '韩国', KWT: '科威特', LAO: '老挝',
  LBN: '黎巴嫩', LBR: '利比里亚', LBY: '利比亚', LCA: '圣卢西亚', LIE: '列支敦士登',
  LKA: '斯里兰卡', LSO: '莱索托', LTU: '立陶宛', LUX: '卢森堡', LVA: '拉脱维亚',
  MAC: '中国澳门', MAF: '法属圣马丁', MAR: '摩洛哥', MDA: '摩尔多瓦', MDG: '马达加斯加',
  MDV: '马尔代夫', MEX: '墨西哥', MHL: '马绍尔群岛', MKD: '北马其顿', MLI: '马里',
  MLT: '马耳他', MMR: '缅甸', MNE: '黑山', MNG: '蒙古', MOZ: '莫桑比克',
  MRT: '毛里塔尼亚', MUS: '毛里求斯', MWI: '马拉维', MYS: '马来西亚', NAM: '纳米比亚',
  NCL: '新喀里多尼亚', NER: '尼日尔', NGA: '尼日利亚', NIC: '尼加拉瓜', NLD: '荷兰',
  NOR: '挪威', NPL: '尼泊尔', NZL: '新西兰', OMN: '阿曼', PAK: '巴基斯坦',
  PAN: '巴拿马', PER: '秘鲁', PHL: '菲律宾', PLW: '帕劳', PNG: '巴布亚新几内亚',
  POL: '波兰', PRI: '波多黎各', PRK: '朝鲜', PRT: '葡萄牙', PRY: '巴拉圭',
  PSE: '巴勒斯坦', PYF: '法属波利尼西亚', QAT: '卡塔尔', ROU: '罗马尼亚', RUS: '俄罗斯',
  RWA: '卢旺达', SAU: '沙特阿拉伯', SDN: '苏丹', SEN: '塞内加尔', SGP: '新加坡',
  SLB: '所罗门群岛', SLE: '塞拉利昂', SLV: '萨尔瓦多', SMR: '圣马力诺', SOM: '索马里',
  SRB: '塞尔维亚', SSD: '南苏丹', STP: '圣多美和普林西比', SUR: '苏里南', SVK: '斯洛伐克',
  SVN: '斯洛文尼亚', SWE: '瑞典', SWZ: '斯威士兰', SXM: '荷属圣马丁', SYC: '塞舌尔',
  SYR: '叙利亚', TCD: '乍得', TGO: '多哥', THA: '泰国', TJK: '塔吉克斯坦',
  TKM: '土库曼斯坦', TLS: '东帝汶', TON: '汤加', TTO: '特立尼达和多巴哥', TUN: '突尼斯',
  TUR: '土耳其', TZA: '坦桑尼亚', UGA: '乌干达', UKR: '乌克兰', URY: '乌拉圭',
  USA: '美国', UZB: '乌兹别克斯坦', VCT: '圣文森特和格林纳丁斯', VEN: '委内瑞拉',
  VIR: '美属维尔京群岛', VNM: '越南', VUT: '瓦努阿图', WSM: '萨摩亚', XKX: '科索沃',
  YEM: '也门', ZAF: '南非', ZMB: '赞比亚', ZWE: '津巴布韦',
};

const rows = d3.csvParse(fs.readFileSync(SRC, 'utf8'));
const byCode = new Map();

const num = (v) => (v === undefined || v === '' ? null : Number(v));
const round = (v, p) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(p)));

for (const r of rows) {
  const year = Number(r.year);
  const i = yearIndex.get(year);
  if (i === undefined) continue;

  let c = byCode.get(r.code);
  if (!c) {
    c = {
      code: r.code,
      name: r.name,
      zh: NAME_ZH[r.code] || r.name_zh || r.name,
      region: r.region,
      regionZh: REGION_ZH[r.region] || r.region,
      income: r.income,
      incomeZh: INCOME_ZH[r.income] || '未分组',
      le: new Array(YEARS.length).fill(null),
      fertility: new Array(YEARS.length).fill(null),
      gdp: new Array(YEARS.length).fill(null),
      pop: new Array(YEARS.length).fill(null),
    };
    byCode.set(r.code, c);
  }
  c.le[i] = round(num(r.le), 1);
  c.fertility[i] = round(num(r.fertility), 2);
  const gdp = round(num(r.gdp_ppp), 0);
  c.gdp[i] = gdp !== null && gdp > 0 ? gdp : null;
  c.pop[i] = round(num(r.pop), 0);
}

const countries = [...byCode.values()]
  .filter((c) => c.le.some((v) => v !== null))
  .sort((a, b) => a.code.localeCompare(b.code));

const payload = {
  meta: {
    title: '预期寿命与人均 GDP，1960–2019',
    source: 'World Bank, World Development Indicators（经 4/eda/wrangle.py 整理）',
    years: YEARS,
    regionZh: REGION_ZH,
    incomeZh: INCOME_ZH,
    note:
      'le = 出生时预期寿命（岁）；gdp = 人均 GDP，2017 年不变价国际元（PPP）；' +
      'fertility = 总和生育率；pop = 人口。人均 GDP 自 1990 年起才有系统记录。',
  },
  countries,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const json = JSON.stringify(payload);
fs.writeFileSync(OUT, json);
// 同一份数据再写一份 JS：这样直接双击 index.html（file://）也能打开，不需要本地服务器
fs.writeFileSync(OUT_JS, 'window.__LIFE_DATA__ = ' + json + ';\n');

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`wrote ${OUT} (${kb(OUT)})`);
console.log(`wrote ${OUT_JS} (${kb(OUT_JS)})`);
console.log(`${countries.length} countries, ${YEARS.length} years`);

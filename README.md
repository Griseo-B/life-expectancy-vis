# 寿命变长，是所有国家一起变好吗？

1960–2019 年、208 个国家的预期寿命交互式可视化。课程作业 3（交互式可视化）。

**在线作品**：<https://griseo-b.github.io/life-expectancy-vis/>
**设计说明与报告**：<https://griseo-b.github.io/life-expectancy-vis/report.html>

- 主图：气泡散点（横轴可切换生育率 / 人均 GDP，纵轴预期寿命，面积人口，颜色地区），时间轴可播放；空心小圈保留起点年份的位置。
- 右上：按地区排列的寿命点图，空心圈标出 1960 年的地区中位数。
- 右下：被选中国家的对比面板，带 1960–2019 的走势小图。
- 交互：播放/拖动年份、悬停提示、拖框刷选、单击加入对比、点地区名过滤、切换横轴指标、悬停显示单国轨迹、重置。

## 直接打开

双击 `index.html` 即可（数据以 `data/countries.js` 的形式加载，不依赖本地服务器）。

也可以起一个静态服务器：

```bash
python -m http.server 8000
# 打开 http://localhost:8000/
```

## 目录

```
index.html          页面结构
styles.css          样式
app.js              可视化与交互（D3 v7）
report.html         设计说明与报告
报告.md             报告的 Markdown 版
build_data.js       由 4/eda/data/countries.csv 生成 data/countries.json / .js
data/countries.json 紧凑数据（60 年，按国家分组，指标为数组）
data/countries.js   同一份数据，挂到 window.__LIFE_DATA__
vendor/d3.min.js    D3 v7.9.0（ISC）
```

## 重新生成数据

数据来自课程 EDA 作业整理后的 `../4/eda/data/countries.csv`：

```bash
node build_data.js
```

脚本只做字段重排与中文国名映射，不改动数值；缺失值保留为 `null`。

## 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "feat: life expectancy interactive visualization"
gh repo create life-expectancy-vis --public --source=. --push
gh api -X POST repos/{owner}/life-expectancy-vis/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

仓库根目录有 `.nojekyll`，静态文件会原样提供，不需要构建。

## 数据与许可

- 数据：World Bank, *World Development Indicators*，<https://databank.worldbank.org/source/world-development-indicators>，CC BY 4.0。
- 代码：D3.js v7.9.0，ISC 许可，见 `vendor/d3.LICENSE`。

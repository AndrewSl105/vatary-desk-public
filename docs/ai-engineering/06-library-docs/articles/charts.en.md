---
id: pages.charts
section: pages
order: 18
title: Charts on a page
summary: Insert a bar, line, area or pie chart from Insert → Charts, then type or paste its numbers.
covers:
  - client/src/features/page/blocks/chart.ts
  - client/src/features/page/blocks/chartView.ts
  - client/src/features/page/components/PageToolbarInserts.tsx
related: [pages.block-templates]
audience: user
updated: 2026-11-11
---

A chart is a block of the page: categories along the bottom, one or more series of numbers, and a caption under it. It looks the same on the page, through a shared link, and in a PDF or Word export.

## Inserting a chart {#insert}

1. Put the cursor where the chart should go.
2. On the page toolbar, click **Insert** and choose **Charts** on the left. Each card shows the kind of chart it inserts: **Bar chart**, **Stacked bars**, **Line chart**, **Area chart**, **Stacked areas** or **Pie chart**.
3. The chart goes in with example numbers, and its data panel opens right away. Replace the numbers and click **Done**.

You can also type `/` and "chart" (or "діаграма") right in the text.

## Changing a chart {#edit}

Point at a chart and click **Data** in its corner. In the panel:

- **Type** switches between bars, line, areas and pie and keeps the numbers. A pie shows the first series only.
- **Stacking** puts bars or areas side by side or on top of each other.
- **Numbers** shows the values as they are, compact (12K) or as a percent.
- The grid holds the numbers. The first column is the categories and the header row holds the series names. **+ Row** and **+ Series** add one more, and **×** removes one.
- To replace all the data at once, copy cells from a spreadsheet and paste them anywhere in the panel.

**Done** saves the change. **Cancel** or {{kbd:escape}} discards it. To write the caption, click below the drawing.

:::info
Charts are rich blocks. If rich blocks are turned off for your workspace, **Charts** is not offered.
:::

## Link, image, document and table {#toolbar}

Four inserts sit right on the toolbar row, next to **Insert**:

- **Link** adds a web address.
- **Image** adds a picture.
- **Link a document or file** links to another page, table or file of your workspace.
- **Table**: point at the grid to choose the size, then click.

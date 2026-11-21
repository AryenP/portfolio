import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// The brush needs the scales after the chart is drawn, so they live out here
// instead of inside renderScatterPlot.
let xScale;
let yScale;

// Step 1.1: read the CSV. Everything arrives as a string, so convert the
// numbers and dates on the way in.
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// Step 1.2: one object per commit, built from the lines that commit still owns.
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      // Every line in a commit has the same author and timestamp.
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/AryenP/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // 2:30 PM becomes 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Not enumerable, so the lines don't flood console.log(commits).
      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });

      return ret;
    })
    // Lab 8 Step 3.3: the story walks through commits in order, so sort them.
    .sort((a, b) => a.datetime - b.datetime);
}

// Step 1.3: summary stats.
// Lab 8: called again whenever the slider moves, so clear the old box first.
function renderCommitInfo(data, commits) {
  d3.select('#stats').html('');
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Distinct values: how many different files there are.
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  // Grouped aggregate: a file's length is its highest line number.
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (v) => v.line),
    (d) => d.file,
  );
  dl.append('dt').text('Longest file');
  dl.append('dd').text(d3.max(fileLengths, (d) => d[1]));

  dl.append('dt').text('Avg file length');
  dl.append('dd').text(Math.round(d3.mean(fileLengths, (d) => d[1])));

  // Whole-dataset aggregate.
  dl.append('dt').text('Longest line');
  dl.append('dd').text(d3.max(data, (d) => d.length));

  // Min/max value: which part of the day has the most lines written in it.
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? '';
  dl.append('dt').text('Most work');
  // "in the evening" is too long for the box, so keep just "evening".
  dl.append('dd').text(maxPeriod.replace(/^(in the|at) /, ''));
}

// Steps 2 and 4: date on x, time of day on y, dot area = lines edited.
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Gridlines go in before the axes so they sit behind everything else.
  // They are just an axis with no labels and very long ticks.
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width),
  );

  // Blue lines at night, orange ones around midday.
  const timeColor = d3
    .scaleSequential(d3.interpolateRgb('steelblue', 'orange'))
    .domain([0, 12]);
  gridlines
    .selectAll('.tick line')
    .attr('stroke', (d) => timeColor(12 - Math.abs(d - 12)));

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  // Lab 8 Step 1.2: classes so updateScatterPlot can find the axes again.
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  svg.append('g').attr('class', 'dots');
  drawDots(svg, commits);

  createBrushSelector(svg);
}

// Square root scale, so a commit with twice the lines gets twice the area,
// not twice the radius. Shared by the first render and every update.
function drawDots(svg, commits) {
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  // Biggest first: small dots are drawn last, on top, and stay hoverable.
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    // Lab 8 Step 1.3: key by commit id so each commit keeps its own circle.
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    // Lets the CSS keep the grow-in speed the same for big and small dots.
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// Lab 8 Step 1.2: redraw the existing chart instead of appending a new svg.
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  drawDots(svg, commits);
}

// Step 3: tooltip.
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-hour');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.datetime?.toLocaleString('en', {
    timeStyle: 'short',
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  // Dots near the right or bottom edge would push the box off screen,
  // so stop it 8px short of the window edge.
  const { width, height } = tooltip.getBoundingClientRect();
  const x = Math.min(event.clientX, window.innerWidth - width - 8);
  const y = Math.min(event.clientY, window.innerHeight - height - 8);
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

// Step 5: brushing.
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));

  // The brush adds an overlay that catches every mouse event, which kills the
  // tooltips. Moving the dots after it in the DOM puts them back on top.
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// The selection is [[x0, y0], [x1, y1]] in SVG coordinates, so map the commit
// to the same coordinates and check that it falls inside.
function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [x0, x1] = selection.map((d) => d[0]);
  const [y0, y1] = selection.map((d) => d[1]);
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${
    selectedCommits.length || 'No'
  } commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }
  const requiredCommits = selectedCommits.length ? selectedCommits : commits;
  const lines = requiredCommits.flatMap((d) => d.lines);

  // Count lines per language (css, js, html).
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
            <dt>${language}</dt>
            <dd>${count} lines (${formatted})</dd>
        `;
  }
}

// Lab 8 Step 2: one dot per line of code, grouped by file, biggest file first.
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        div.append('dt');
        div.append('dd');
      }),
    );

  filesContainer
    .select('dt')
    .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

let data = await loadData();
let commits = processCommits(data);

// Lab 8 Step 1.1: the slider goes from 0 to 100, and timeScale turns that
// percentage into a date between the first and last commit.
let commitProgress = 100;
const timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);
let filteredCommits = commits;

const slider = document.getElementById('commit-progress');
const timeLabel = document.getElementById('commit-time');

// Everything that depends on the cutoff date, in one place, so the slider and
// the scrolling story stay in sync.
function updateForTime(maxTime) {
  commitMaxTime = maxTime;
  timeLabel.dateTime = maxTime.toISOString();
  timeLabel.textContent = maxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredLines = filteredCommits.flatMap((d) => d.lines);

  renderCommitInfo(filteredLines, filteredCommits);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  updateForTime(timeScale.invert(commitProgress));
}

slider.addEventListener('input', onTimeSliderChange);

renderScatterPlot(data, commits);
onTimeSliderChange();

// Lab 8 Step 3.2: one paragraph per commit for the scrolling story.
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html((d, i) => {
    const fileCount = d3.rollups(
      d.lines,
      (D) => D.length,
      (d) => d.file,
    ).length;
    const when = d.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const what =
      i === 0 ? 'my first commit' : i === commits.length - 1 ? 'my latest commit' : 'commit ' + (i + 1);
    return `
      <p>On ${when}, I made <a href="${d.url}" target="_blank">${what}</a>.
      It still owns ${d.totalLines} ${d.totalLines === 1 ? 'line' : 'lines'} across ${fileCount}
      ${fileCount === 1 ? 'file' : 'files'}.</p>`;
  });

// Lab 8 Step 3.3: when a commit's paragraph crosses the middle of the screen,
// show everything up to that commit.
function onStepEnter(response) {
  const commit = response.element.__data__;
  slider.value = timeScale(commit.datetime);
  commitProgress = Number(slider.value);
  updateForTime(commit.datetime);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);

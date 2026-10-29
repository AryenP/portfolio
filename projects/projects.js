import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

// Step 1.6 (Lab 4): the count comes from the data, so it updates when projects.json does.
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle && Array.isArray(projects)) {
  projectsTitle.textContent = `${projects.length} Projects`;
}

// ---------------------------------------------------------------------------
// Lab 5
// ---------------------------------------------------------------------------

const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const sliceGenerator = d3.pie().value((d) => d.value).sort(null);
const colors = d3.scaleOrdinal(d3.schemeTableau10);

const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const searchInput = document.querySelector('.searchBar');

// The two filters live in shared state, so each one can see the other.
// The year is stored by label, not by slice index: when the search changes,
// the pie is redrawn and index 0 may be a different year.
let query = '';
let selectedYear = null;

// Search filter only: every project whose text contains the query.
function filterByQuery(projectsGiven) {
  const q = query.toLowerCase();
  return projectsGiven.filter((project) => {
    const values = Object.values(project).join('\n').toLowerCase();
    return values.includes(q);
  });
}

// Both filters together: the search AND the selected year.
function applyFilters() {
  const searched = filterByQuery(projects);
  // If the search removed every project from the selected year, drop the selection
  // first, so the list shows the search results instead of nothing.
  if (selectedYear !== null && !searched.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }
  const visible =
    selectedYear === null ? searched : searched.filter((p) => p.year === selectedYear);
  renderProjects(visible, projectsContainer, 'h2');
  renderPieChart(searched);
}

function renderPieChart(projectsGiven) {
  // Count projects per year, oldest year first so slices keep a stable order.
  const rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  const data = rolledData
    .map(([year, count]) => ({ value: count, label: year }))
    .sort((a, b) => d3.ascending(a.label, b.label));

  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  // Clear the old chart before drawing the new one.
  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(data[i].label))
      .attr('class', data[i].label === selectedYear ? 'selected' : null)
      .on('click', () => selectYear(data[i].label));
  });

  data.forEach((d) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', d.label === selectedYear ? 'legend-item selected' : 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => selectYear(d.label));
  });
}

// Clicking a selected slice deselects it; clicking another one switches to it.
function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  applyFilters();
}

searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  applyFilters();
});

// Initial render on page load.
applyFilters();

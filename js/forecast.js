import { icon, escapeHTML } from './icons.js';
import { temp, wind, condition, currentHourIndex, localHour, dayLabel, number, present } from './weather.js';
import { t, formatNumber } from './i18n.js';

export function createForecast(getState) {
  let chart, period = 'hourly', metric = 'temperature';
  const container = document.querySelector('.chart-container');
  document.querySelectorAll('[data-period]').forEach(btn => btn.addEventListener('click', () => {
    period = btn.dataset.period;
    document.querySelectorAll('[data-period]').forEach(b => { b.classList.toggle('active',b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    render();
  }));
  document.querySelectorAll('[data-metric]').forEach(btn => btn.addEventListener('click', () => {
    metric = btn.dataset.metric;
    document.querySelectorAll('[data-metric]').forEach(b => { b.classList.toggle('active',b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    render();
  }));
  function render() {
    const { weather: data, prefs } = getState();
    const empty = document.getElementById('forecast-empty');
    if (!data) {
      chart?.destroy(); chart = null;
      empty.hidden = false; empty.textContent = t('forecast.unavailable');
      document.getElementById('hourly-strip').replaceChildren();
      document.getElementById('daily-forecast').replaceChildren();
      container.hidden = true;
      return;
    }
    empty.hidden = true;
    container.hidden = false;
    const h = data.hourly, d = data.daily, start = currentHourIndex(data);
    const indexes = period === 'daily' ? d.time.map((_,i) => i) : Array.from({length:Math.min(24,h.time.length-start)},(_,i) => start+i);
    const labels = indexes.map(i => period === 'daily' ? dayLabel(d.time[i],i) : localHour(h.time[i],true));
    const values = indexes.map(i => {
      const raw = metric === 'temperature' ? (period === 'daily' ? d.temperature_2m_max[i] : h.temperature_2m[i]) : metric === 'rain' ? (period === 'daily' ? d.precipitation_probability_max[i] : h.precipitation_probability[i]) : (period === 'daily' ? d.wind_speed_10m_max[i] : h.wind_speed_10m[i]);
      if (!present(raw)) return null;
      return metric === 'temperature' && prefs.temperature === 'fahrenheit' ? raw*9/5+32 : metric === 'wind' && prefs.wind === 'mph' ? raw/1.609344 : raw;
    });
    const unit = metric === 'temperature' ? (prefs.temperature === 'fahrenheit' ? '°F' : '°C') : metric === 'rain' ? '%' : prefs.wind === 'mph' ? 'mph' : 'km/h';
    document.getElementById('chart-unit').textContent = unit;
    const color = metric === 'rain' ? '#76a2b0' : metric === 'wind' ? '#809f95' : '#b5a164';
    document.getElementById('forecast-description').textContent = period === 'daily' ? t('forecast.dailyDescription') : t('forecast.subtitle');
    if (window.Chart) {
      chart?.destroy();
      const canvas = document.getElementById('forecast-chart');
      const ctx = canvas.getContext('2d');
      let gradient;
      if (metric === 'rain') {
        gradient = ctx.createLinearGradient(0, 0, 0, 135);
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0.85)');
        gradient.addColorStop(0.6, 'rgba(56, 189, 248, 0.35)');
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0.05)');
      } else if (metric === 'wind') {
        gradient = ctx.createLinearGradient(0, 0, 0, 135);
        gradient.addColorStop(0, 'rgba(20, 184, 166, 0.50)');
        gradient.addColorStop(0.6, 'rgba(20, 184, 166, 0.15)');
        gradient.addColorStop(1, 'rgba(20, 184, 166, 0.00)');
      } else {
        gradient = ctx.createLinearGradient(0, 0, 0, 135);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.48)');
        gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.20)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
      }
      const lineColor = metric === 'rain' ? '#0284c7' : metric === 'wind' ? '#0d9488' : '#059669';
      chart = new Chart(canvas, {
        type: metric === 'rain' ? 'bar' : 'line',
        data: {
          labels,
          datasets: [{
            data: values,
            label: metric === 'rain' ? t('forecast.precipitationProbability') : metric === 'wind' ? t('forecast.windSpeed') : period === 'daily' ? t('forecast.dailyHigh') : t('forecast.temperatureLabel'),
            borderColor: lineColor,
            backgroundColor: gradient,
            fill: true,
            tension: 0.38,
            cubicInterpolationMode: 'monotone',
            borderWidth: 2.8,
            pointRadius: period === 'daily' ? 4 : 0,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: lineColor,
            pointBorderWidth: 2.2,
            pointHoverRadius: 7.5,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: lineColor,
            pointHoverBorderWidth: 3.5,
            borderRadius: metric === 'rain' ? 6 : 0,
            maxBarThickness: 18
          }]
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 550, easing: 'easeOutQuart' },
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              titleFont: { family: "'Manrope', sans-serif", size: 11, weight: '700' },
              bodyFont: { family: "'DM Sans', sans-serif", size: 11, weight: '500' },
              padding: { top: 9, bottom: 9, left: 12, right: 12 },
              cornerRadius: 8,
              displayColors: false,
              caretSize: 6,
              callbacks: {
                label: ctx => `${ctx.dataset.label}: ${number(ctx.parsed.y, metric === 'rain' ? 0 : 1)} ${unit}`,
                afterLabel: ctx => {
                  const i = indexes[ctx.dataIndex];
                  const cInfo = period === 'daily' ? condition(d.weather_code[i]) : condition(h.weather_code[i]);
                  return period === 'daily'
                    ? `${cInfo.emoji} ${cInfo.label} · ${t('forecast.low')} ${temp(d.temperature_2m_min[i], prefs)}`
                    : `${cInfo.emoji} ${cInfo.label} · ${t('forecast.rain')} ${number(h.precipitation_probability[i])}%`;
                }
              }
            }
          },
          scales: {
            x: { display: false, grid: { display: false } },
            y: {
              position: 'right',
              border: { display: false },
              grid: { color: 'rgba(38, 114, 97, 0.08)', drawTicks: false },
              ticks: {
                maxTicksLimit: 4,
                padding: 8,
                color: '#83968b',
                font: { family: 'DM Sans', size: 8.5, weight: '500' },
                callback: value => `${formatNumber(Number(value),{maximumFractionDigits:1})}${metric === 'rain' ? '%' : metric === 'temperature' ? '°' : ''}`
              },
              ...(metric === 'rain' ? { min: 0, max: 100 } : {})
            }
          }
        }
      });
    } else { container.hidden = true; empty.hidden = false; empty.textContent = t('forecast.chartUnavailable'); }
    const strip = document.getElementById('hourly-strip'), daily = document.getElementById('daily-forecast');
    strip.hidden = period === 'daily'; daily.hidden = period !== 'daily';
    strip.innerHTML = indexes.filter((_,i) => i%3 === 0).map((i,j) => {
      const cond = condition(h.weather_code[i]);
      const timeLabel=localHour(h.time[i]),probability=number(h.precipitation_probability[i]);
      return `<button class="hour-item ${j===0?'active':''}" data-index="${i-start}" aria-label="${escapeHTML(t('forecast.hourAria',{time:timeLabel,condition:cond.label,temperature:temp(h.temperature_2m[i],prefs,true),probability}))}"><span>${j===0?t('forecast.now'):localHour(h.time[i],true)}</span><span class="hour-visual">${icon(cond.icon)}<span class="emoji-mini">${cond.emoji}</span></span><strong>${temp(h.temperature_2m[i],prefs)}</strong><small>${icon('droplet')}${number(h.precipitation_probability[i])}%</small></button>`;
    }).join('');
    strip.querySelectorAll('.hour-item').forEach(btn => btn.addEventListener('click', () => {
      strip.querySelectorAll('.hour-item').forEach(b => b.classList.toggle('active',b===btn));
      if (!chart) return;
      const i = Number(btn.dataset.index), meta = chart.getDatasetMeta(0).data[i];
      chart.setActiveElements([{datasetIndex:0,index:i}]);
      if (meta) chart.tooltip.setActiveElements([{datasetIndex:0,index:i}],{x:meta.x,y:meta.y});
      chart.update('none');
    }));
    // Temperature bars are computed from the week's real min/max range, so
    // each row encodes both its position and its span — never a decorative
    // identical gradient. Accessible text carries the same numbers.
    const lows = d.temperature_2m_min.map(v => present(v) ? Number(v) : null);
    const highs = d.temperature_2m_max.map(v => present(v) ? Number(v) : null);
    const usableLows = lows.filter(present), usableHighs = highs.filter(present);
    const weekMin = usableLows.length ? Math.min(...usableLows) : 0;
    const weekMax = usableHighs.length ? Math.max(...usableHighs) : 1;
    const span = Math.max(1, weekMax - weekMin);
    daily.innerHTML = d.time.map((time,i) => {
      const cond = condition(d.weather_code[i]);
      const low = lows[i], high = highs[i];
      const valid = present(low) && present(high);
      const left = valid ? Math.max(0, Math.min(100, ((low - weekMin) / span) * 100)) : 0;
      const width = valid ? Math.max(2, Math.min(100 - left, ((high - low) / span) * 100)) : 0;
      const bar = valid
        ? `<span class="temp-bar"><span class="temp-fill" style="margin-left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span></span>`
        : `<span class="temp-bar" aria-hidden="true"><span class="temp-fill" style="width:0"></span></span>`;
      const accessible = valid
        ? `<span class="sr-only">${escapeHTML(t('forecast.dailyRangeAria',{low:temp(low,prefs,true),high:temp(high,prefs,true),minimum:temp(weekMin,prefs,true),maximum:temp(weekMax,prefs,true)}))}</span>`
        : `<span class="sr-only">${escapeHTML(t('forecast.dailyUnavailable'))}</span>`;
      return `<div class="daily-row"><strong>${dayLabel(time,i)}</strong><span class="daily-weather-cell">${icon(cond.icon)}<span class="emoji-badge">${cond.emoji}</span></span><div class="daily-range" title="${escapeHTML(t('forecast.dailyRangeTitle'))}"><strong>${temp(low,prefs)}</strong>${bar}<strong>${temp(high,prefs)}</strong>${accessible}</div><span title="${escapeHTML(t('forecast.rainChanceTitle'))}" class="daily-rain-chance">💧 ${number(d.precipitation_probability_max[i])}%</span><span class="daily-wind">💨 ${wind(d.wind_speed_10m_max[i],prefs)}</span><span class="daily-condition">${escapeHTML(cond.label)}</span></div>`;
    }).join('');
    document.getElementById('forecast-source').textContent = t('forecast.sourceAtTime',{timezone:data.timezone.replaceAll('_',' ')});
  }
  return { render, resize:() => chart?.resize() };
}

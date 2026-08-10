<script setup lang="ts">
import { WEEKDAY_LABELS, type CalendarMonth } from "../lib/present";

defineProps<{ months: CalendarMonth[] }>();
</script>

<template>
  <section v-for="month in months" :key="month.label" class="month">
    <div class="month-head">
      <h2 class="month-label">{{ month.label }}</h2>
    </div>

    <div class="cal-scroll">
      <div class="cal-grid">
        <div v-for="(label, i) in WEEKDAY_LABELS" :key="i" class="cal-head">{{ label }}</div>
        <div v-for="(cell, i) in month.cells" :key="i" class="cal-cell">
          <div class="day-num" :class="{ 'is-outside': !cell.inMonth }">{{ cell.dayNum }}</div>
          <div v-for="(item, j) in cell.items" :key="j" class="item" :title="item.tip">
            <span class="dot" :style="{ background: item.color }" />
            <span class="label">{{ item.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.month {
  margin-bottom: 34px;
}

.month-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 10px;
}

.month-label {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.cal-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* The grid lines are the parent showing through 1px gaps. */
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: 10px;
  overflow: hidden;
}

.cal-head {
  background: var(--bg);
  padding: 5px 6px;
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
}

.cal-cell {
  background: var(--bg);
  min-height: 92px;
  padding: 5px 6px;
}

.day-num {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
  text-align: right;
}

.day-num.is-outside {
  color: transparent;
}

.item {
  display: flex;
  gap: 5px;
  align-items: baseline;
  font-size: 11px;
  line-height: 1.45;
  margin-bottom: 3px;
}

.dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  display: inline-block;
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media print {
  .month {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Printers drop backgrounds by default, so the gaps have to become borders. */
  .cal-grid {
    gap: 0;
    border-color: var(--border);
  }

  .cal-head,
  .cal-cell {
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
}

@media screen and (max-width: 860px) {
  .cal-grid {
    min-width: 620px;
  }

  .cal-scroll {
    margin: 0 -16px;
    padding: 0 16px;
  }
}
</style>

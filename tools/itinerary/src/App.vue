<script setup lang="ts">
import ZoneChooser from "./components/ZoneChooser.vue";
</script>

<template>
  <div class="app">
    <div class="sheet">
      <RouterView />
    </div>
    <ZoneChooser />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
}
</style>

<template>
  <div ref="el" :style="{ width: '100%', height }" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';

const props = withDefaults(defineProps<{ option: echarts.EChartsOption; height?: string }>(), { height: '300px' });
const el = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
const resize = () => chart?.resize();

onMounted(() => {
  chart = echarts.init(el.value!);
  chart.setOption(props.option);
  window.addEventListener('resize', resize);
});
watch(
  () => props.option,
  (o) => chart?.setOption(o, true),
  { deep: true },
);
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
});
</script>

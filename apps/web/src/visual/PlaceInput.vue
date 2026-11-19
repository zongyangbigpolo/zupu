<template>
  <div class="place">
    <el-autocomplete
      :model-value="name"
      :fetch-suggestions="suggest"
      :placeholder="placeholder ?? '地名，如 江西吉安府泰和县'"
      clearable
      style="flex: 1; min-width: 180px"
      @update:model-value="(v: string) => emit('update:name', v)"
      @select="onSelect"
    />
    <el-input-number :model-value="lng ?? undefined" :precision="4" :step="0.01" :min="-180" :max="180" controls-position="right" placeholder="经度" style="width: 130px" @update:model-value="(v: number | undefined) => emit('update:lng', v ?? null)" />
    <el-input-number :model-value="lat ?? undefined" :precision="4" :step="0.01" :min="-90" :max="90" controls-position="right" placeholder="纬度" style="width: 130px" @update:model-value="(v: number | undefined) => emit('update:lat', v ?? null)" />
    <el-tooltip content="按内置常用地名填充坐标">
      <el-button :icon="'MagicStick'" @click="fill" />
    </el-tooltip>
    <el-tooltip content="在地图上选点">
      <el-button :icon="'Location'" @click="picking = true" />
    </el-tooltip>
    <el-dialog v-model="picking" title="在地图上选点" width="760px" append-to-body destroy-on-close>
      <div style="height: 460px">
        <MapCanvas :markers="current" pick-mode :animate="false" :fit-key="1" @pick="onPick" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { GAZETTEER, lookupPlace } from '@zupu/shared';
import MapCanvas from './MapCanvas.vue';

const props = defineProps<{ name: string; lng: number | null | undefined; lat: number | null | undefined; placeholder?: string }>();
const emit = defineEmits<{
  (e: 'update:name', v: string): void;
  (e: 'update:lng', v: number | null): void;
  (e: 'update:lat', v: number | null): void;
}>();
const picking = ref(false);
const current = computed(() => (props.lng != null && props.lat != null ? [{ id: 'cur', name: props.name || '当前位置', lng: props.lng, lat: props.lat }] : []));

function suggest(q: string, cb: (r: { value: string }[]) => void) {
  const s = (q ?? '').trim();
  cb(GAZETTEER.filter((g) => !s || g.name.includes(s) || s.includes(g.name)).slice(0, 12).map((g) => ({ value: g.name })));
}
function onSelect(item: Record<string, any>) {
  const g = lookupPlace(item.value);
  if (g) {
    emit('update:lng', g.lng);
    emit('update:lat', g.lat);
  }
}
function fill() {
  const g = lookupPlace(props.name);
  if (!g) return ElMessage.warning('内置地名中未找到，请在地图上选点或手动填写');
  emit('update:lng', g.lng);
  emit('update:lat', g.lat);
  ElMessage.success(`已按"${g.name}"填充坐标`);
}
function onPick(v: { lng: number; lat: number }) {
  emit('update:lng', v.lng);
  emit('update:lat', v.lat);
  picking.value = false;
}
</script>

<style scoped>
.place { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; width: 100%; }
</style>

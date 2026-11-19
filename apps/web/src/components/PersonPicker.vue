<template>
  <el-select
    :model-value="modelValue"
    filterable
    remote
    clearable
    :remote-method="search"
    :loading="loading"
    :placeholder="placeholder ?? '输入姓名搜索'"
    style="width: 100%"
    @update:model-value="onChange"
  >
    <el-option v-for="o in options" :key="o.id" :value="o.id" :label="o.fullName">
      <div class="row" style="gap: 6px">
        <span :class="o.gender">{{ o.fullName }}</span>
        <span class="muted">{{ o.disambiguation }}</span>
        <el-tag v-if="o.sameNameCount > 1" size="small" type="warning">重名</el-tag>
      </div>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PersonSearchItem } from '@zupu/shared';
import { api } from '../api';

const props = defineProps<{ clanId: string; modelValue: string | null | undefined; placeholder?: string; initial?: PersonSearchItem | { id: string; fullName: string } | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void; (e: 'select', v: PersonSearchItem | null): void }>();

const options = ref<PersonSearchItem[]>([]);
const loading = ref(false);

watch(
  () => props.initial,
  (v) => {
    if (v && !options.value.some((o) => o.id === v.id)) options.value = [{ disambiguation: '', sameNameCount: 1, ...(v as any) }, ...options.value];
  },
  { immediate: true },
);

async function search(q: string) {
  if (!q.trim()) return;
  loading.value = true;
  try {
    options.value = (await api.clans.searchPersons(props.clanId, { q, pageSize: 30 })).items;
  } finally {
    loading.value = false;
  }
}
function onChange(v: string | null) {
  emit('update:modelValue', v || null);
  emit('select', options.value.find((o) => o.id === v) ?? null);
}
</script>

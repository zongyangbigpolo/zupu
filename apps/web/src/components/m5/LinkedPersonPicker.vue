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
    @update:model-value="(v: string) => emit('update:modelValue', v || null)"
  >
    <el-option v-for="o in options" :key="o.id" :value="o.id" :label="o.fullName">
      <div class="row" style="gap: 6px">
        <span :class="o.gender">{{ o.fullName }}</span>
        <span class="muted">{{ o.generation ? `第${o.generation}世` : o.isExternal ? '外姓' : '' }}{{ o.generationChar ? ' · ' + o.generationChar + '字辈' : '' }}</span>
        <el-tag v-if="o.isLiving" size="small" type="success">在世</el-tag>
      </div>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LinkedPersonItem, PersonBrief } from '@zupu/shared';
import { m5api } from '../../m5-api';

/** 在连谱某一方家族中搜索人物：本族族人可搜全族，对方家族只能搜连谱支系 */
const props = defineProps<{ linkId: string; clanId: string; modelValue: string | null; placeholder?: string; initial?: PersonBrief | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>();
const options = ref<(LinkedPersonItem | PersonBrief)[]>([]);
const loading = ref(false);

watch(
  () => props.initial,
  (v) => {
    if (v && !options.value.some((o) => o.id === v.id)) options.value = [v, ...options.value];
  },
  { immediate: true },
);
watch(
  () => props.clanId,
  () => (options.value = props.initial ? [props.initial] : []),
);

async function search(q: string) {
  if (!q.trim()) return;
  loading.value = true;
  try {
    options.value = await m5api.clanLinks.persons(props.linkId, { clanId: props.clanId, q });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="re">
    <div class="bar">
      <el-button size="small" text @mousedown.prevent="cmd('bold')"><b>B</b></el-button>
      <el-button size="small" text @mousedown.prevent="cmd('italic')"><i>I</i></el-button>
      <el-button size="small" text @mousedown.prevent="cmd('formatBlock', 'p')">段落</el-button>
      <el-button size="small" text @mousedown.prevent="cmd('formatBlock', 'h4')">小标题</el-button>
      <el-button size="small" text @mousedown.prevent="cmd('insertUnorderedList')">列表</el-button>
    </div>
    <div ref="el" class="area rich" contenteditable="true" @input="emitValue" @blur="emitValue" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { sanitizeHtml } from '../sanitize';

const props = defineProps<{ modelValue: string | null | undefined }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();
const el = ref<HTMLDivElement>();

function cmd(c: string, v?: string) {
  document.execCommand(c, false, v);
  emitValue();
}
function emitValue() {
  if (el.value) emit('update:modelValue', sanitizeHtml(el.value.innerHTML));
}
onMounted(() => {
  if (el.value) el.value.innerHTML = sanitizeHtml(props.modelValue);
});
watch(
  () => props.modelValue,
  (v) => {
    if (el.value && document.activeElement !== el.value && sanitizeHtml(v) !== el.value.innerHTML) el.value.innerHTML = sanitizeHtml(v);
  },
);
</script>

<style scoped>
.re { border: 1px solid #dcdfe6; border-radius: 4px; width: 100%; }
.bar { border-bottom: 1px solid #eee; padding: 2px 6px; background: #fafafa; }
.area { min-height: 140px; padding: 8px 12px; outline: none; }
</style>

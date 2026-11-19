<template>
  <div class="page">
    <div class="row mb">
      <el-button text :icon="'ArrowLeft'" @click="router.push(`/clans/${clanId}`)">返回家族首页</el-button>
      <h2 class="title-serif grow" style="margin: 0">生日 · 忌日提醒</h2>
      <el-select v-model="days" style="width: 130px" @change="load">
        <el-option :value="7" label="未来 7 天" />
        <el-option :value="30" label="未来 30 天" />
        <el-option :value="60" label="未来 60 天" />
      </el-select>
    </div>
    <el-row :gutter="16">
      <el-col :md="15" :xs="24">
        <el-card shadow="never" v-loading="loading">
          <template #header><span class="card-title">即将到来</span><span class="muted">（生日：在世族人；忌日：已故先人；支持农历）</span></template>
          <el-empty v-if="!loading && !list.length" description="近期没有生日或忌日" :image-size="60" />
          <div v-for="r in list" :key="r.person.id + r.kind" class="rem">
            <div class="day" :class="{ today: r.daysLeft === 0 }">
              <b>{{ r.daysLeft === 0 ? '今天' : r.daysLeft }}</b><small v-if="r.daysLeft">天后</small>
            </div>
            <div class="grow">
              <div class="row" style="gap: 8px">
                <router-link :to="`/persons/${r.person.id}`" :class="r.person.gender" style="font-weight: 600">{{ r.person.fullName }}</router-link>
                <el-tag :type="r.kind === 'birth' ? 'success' : 'info'" size="small">{{ REMINDER_KIND_LABELS[r.kind] }}</el-tag>
                <span v-if="r.person.generation" class="muted">第{{ r.person.generation }}世</span>
              </div>
              <div class="muted">
                {{ r.dateText }} · 公历 {{ r.nextDate }}
                <template v-if="r.years && r.years > 0"> · {{ r.kind === 'birth' ? `${r.years} 岁生日` : `逝世 ${r.years} 周年` }}</template>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :md="9" :xs="24">
        <el-card v-if="pref" shadow="never" class="mb">
          <template #header><span class="card-title">我的提醒设置</span></template>
          <el-form label-width="110px" size="small">
            <el-form-item label="接收提醒"><el-switch v-model="pref.enabled" /></el-form-item>
            <el-form-item label="族人生日"><el-switch v-model="pref.birthday" :disabled="!pref.enabled" /></el-form-item>
            <el-form-item label="先人忌日"><el-switch v-model="pref.deathAnniversary" :disabled="!pref.enabled" /></el-form-item>
            <el-form-item label="已报名活动"><el-switch v-model="pref.activity" :disabled="!pref.enabled" /></el-form-item>
            <el-form-item label="提前提醒">
              <el-select v-model="pref.daysBefore" style="width: 120px">
                <el-option v-for="n in [0, 1, 2, 3, 5, 7]" :key="n" :value="n" :label="n ? `提前 ${n} 天` : '仅当天'" />
              </el-select>
            </el-form-item>
            <el-form-item label="微信订阅消息">
              <el-switch v-model="pref.wechat" />
              <span class="muted" style="margin-left: 8px">
                {{ pref.wechatBound ? `剩余 ${pref.wechatQuota.reminder} 次` : '未绑定微信，请在小程序登录' }}
              </span>
            </el-form-item>
            <el-button type="danger" style="width: 100%" @click="savePref">保存设置</el-button>
          </el-form>
        </el-card>
        <el-card v-if="isAdmin" shadow="never">
          <template #header><span class="card-title">设置纪念日（管理员）</span></template>
          <el-form label-width="64px" size="small">
            <el-form-item label="人物"><PersonPicker v-model="personId" :clan-id="clanId" @update:model-value="loadDates" /></el-form-item>
            <template v-if="personId">
              <div v-for="d in dates" :key="d.kind" class="muted" style="margin: 0 0 8px 64px">
                当前{{ REMINDER_KIND_LABELS[d.kind] }}：{{ d.text }}<template v-if="d.source === 'profile'">（取自档案）</template>
                <el-button v-if="d.source === 'manual'" link type="danger" size="small" @click="removeDate(d.kind)">删除</el-button>
              </div>
              <el-form-item label="类型">
                <el-radio-group v-model="form.kind">
                  <el-radio value="birth">生日</el-radio>
                  <el-radio value="death">忌日</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="历法">
                <el-radio-group v-model="form.calendar">
                  <el-radio value="lunar">农历</el-radio>
                  <el-radio value="solar">公历</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="日期">
                <el-select v-model="form.month" style="width: 90px">
                  <el-option v-for="(m, i) in months" :key="i" :value="i + 1" :label="m" />
                </el-select>
                <el-select v-model="form.day" style="width: 90px; margin-left: 6px">
                  <el-option v-for="d in form.calendar === 'lunar' ? 30 : 31" :key="d" :value="d" :label="form.calendar === 'lunar' ? lunarDay(d) : `${d}日`" />
                </el-select>
                <el-checkbox v-if="form.calendar === 'lunar'" v-model="form.isLeapMonth" style="margin-left: 8px">闰月</el-checkbox>
              </el-form-item>
              <el-form-item label="年份"><el-input-number v-model="form.year" :min="1" :max="3000" placeholder="可选" controls-position="right" /></el-form-item>
              <el-button type="danger" style="width: 100%" @click="saveDate">保存</el-button>
            </template>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { REMINDER_KIND_LABELS, type ClanWithRole, type ReminderDate, type ReminderKind, type ReminderPref, type UpcomingReminder } from '@zupu/shared';
import PersonPicker from '../../components/PersonPicker.vue';
import { api, run } from '../../api';
import { m4 } from '../../m4';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
const days = ref(30);
const list = ref<UpcomingReminder[]>([]);
const loading = ref(true);
const pref = ref<ReminderPref | null>(null);
const personId = ref<string | null>(null);
const dates = ref<ReminderDate[]>([]);
const form = reactive({ kind: 'death' as ReminderKind, calendar: 'lunar' as 'lunar' | 'solar', month: 1, day: 1, isLeapMonth: false, year: undefined as number | undefined });

const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const months = computed(() => (form.calendar === 'lunar' ? lunarMonths : lunarMonths.map((_, i) => `${i + 1}月`)));
function lunarDay(d: number) {
  const u = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  return ['初', '十', '廿'][Math.floor(d / 10)] + u[(d % 10) - 1];
}

async function load() {
  loading.value = true;
  list.value = (await run(m4.reminders.upcoming(clanId, days.value))) ?? [];
  loading.value = false;
}
async function savePref() {
  const { wechatQuota: _q, wechatBound: _b, ...data } = pref.value!;
  void _q;
  void _b;
  const r = await run(m4.reminders.savePref(clanId, data), '已保存');
  if (r) pref.value = r;
}
async function loadDates() {
  dates.value = personId.value ? ((await run(m4.reminders.dates(personId.value))) ?? []) : [];
}
async function saveDate() {
  const r = await run(
    m4.reminders.setDate(personId.value!, form.kind, {
      calendar: form.calendar,
      month: form.month,
      day: form.day,
      isLeapMonth: form.calendar === 'lunar' && form.isLeapMonth,
      year: form.year ?? null,
    }),
    '已保存',
  );
  if (r) {
    loadDates();
    load();
  }
}
async function removeDate(kind: ReminderKind) {
  if ((await run(m4.reminders.removeDate(personId.value!, kind), '已删除')) !== undefined) {
    loadDates();
    load();
  }
}

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  load();
  if (clan.value?.myRole === 'admin' || clan.value?.myRole === 'member') pref.value = (await run(m4.reminders.pref(clanId))) ?? null;
});
</script>

<style scoped>
.mb { margin-bottom: 14px; }
.rem { display: flex; gap: 14px; align-items: center; padding: 10px 4px; border-bottom: 1px dashed #eadfca; }
.rem:last-child { border-bottom: 0; }
.day { width: 54px; text-align: center; color: #8a6d3b; flex-shrink: 0; }
.day b { font-size: 22px; display: block; }
.day small { font-size: 11px; }
.day.today { color: var(--zp-red); }
.day.today b { font-size: 16px; }
</style>

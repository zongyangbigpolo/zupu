<template>
  <view>
    <view class="card">
      <view class="row">
        <view class="grow">
          <view class="card-title" style="margin: 0">微信提醒</view>
          <view class="muted">{{ pref?.wechatBound ? `剩余可推送：提醒 ${pref.wechatQuota.reminder} 次 · 活动 ${pref.wechatQuota.activity} 次` : '用微信登录后可接收订阅消息' }}</view>
        </view>
        <button class="btn" size="mini" @click="subscribe">订阅提醒</button>
      </view>
    </view>

    <view class="card">
      <view class="card-title">未来 30 天</view>
      <view v-for="r in list" :key="r.person.id + r.kind" class="list-item" @click="goPerson(r.person.id)">
        <view class="day" :class="{ today: r.daysLeft === 0 }">
          <text class="n">{{ r.daysLeft === 0 ? '今天' : r.daysLeft }}</text>
          <text v-if="r.daysLeft" class="u">天后</text>
        </view>
        <view class="grow">
          <view class="row" style="gap: 10rpx">
            <text :class="r.person.gender" style="font-weight: 600">{{ r.person.fullName }}</text>
            <text class="tag" :class="r.kind === 'birth' ? 'green' : 'gray'">{{ REMINDER_KIND_LABELS[r.kind] }}</text>
          </view>
          <view class="muted">{{ r.dateText }}{{ r.calendar === 'lunar' ? ` · 公历 ${r.nextDate}` : '' }}{{ r.years && r.years > 0 ? (r.kind === 'birth' ? ` · ${r.years}岁` : ` · ${r.years}周年`) : '' }}</view>
        </view>
      </view>
      <view v-if="loaded && !list.length" class="empty">近期没有生日或忌日</view>
    </view>

    <view v-if="pref" class="card">
      <view class="card-title">提醒设置</view>
      <view class="set"><text class="grow">接收提醒</text><switch :checked="pref.enabled" color="#8b1e1e" @change="(e: any) => setPref('enabled', e.detail.value)" /></view>
      <view class="set"><text class="grow">族人生日</text><switch :checked="pref.birthday" color="#8b1e1e" @change="(e: any) => setPref('birthday', e.detail.value)" /></view>
      <view class="set"><text class="grow">先人忌日</text><switch :checked="pref.deathAnniversary" color="#8b1e1e" @change="(e: any) => setPref('deathAnniversary', e.detail.value)" /></view>
      <view class="set"><text class="grow">已报名活动</text><switch :checked="pref.activity" color="#8b1e1e" @change="(e: any) => setPref('activity', e.detail.value)" /></view>
      <view class="set"><text class="grow">微信订阅消息</text><switch :checked="pref.wechat" color="#8b1e1e" @change="(e: any) => setPref('wechat', e.detail.value)" /></view>
      <view class="set">
        <text class="grow">提前提醒</text>
        <picker :range="DAYS.map((d) => (d ? `提前 ${d} 天` : '仅当天'))" :value="DAYS.indexOf(pref.daysBefore)" @change="(e: any) => setPref('daysBefore', DAYS[e.detail.value])">
          <text class="muted">{{ pref.daysBefore ? `提前 ${pref.daysBefore} 天` : '仅当天' }} ▾</text>
        </picker>
      </view>
      <view class="muted">支持农历日期；纪念日由家族管理员在网页端设置</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { REMINDER_KIND_LABELS, type ReminderPref, type UpcomingReminder } from '@zupu/shared';
import { m4, run } from '../../api';
import { requestSubscribe } from '../../subscribe';

const DAYS = [0, 1, 2, 3, 5, 7];
const clanId = ref('');
const list = ref<UpcomingReminder[]>([]);
const loaded = ref(false);
const pref = ref<ReminderPref | null>(null);

onLoad(async (o: any) => {
  clanId.value = o.clanId;
  list.value = (await run(m4.reminders.upcoming(clanId.value, 30))) ?? [];
  loaded.value = true;
  pref.value = (await m4.reminders.pref(clanId.value).catch(() => null)) ?? null;
});

async function setPref<K extends keyof ReminderPref>(k: K, v: ReminderPref[K]) {
  const r = await run(m4.reminders.savePref(clanId.value, { [k]: v } as any));
  if (r) pref.value = r;
}
async function subscribe() {
  await requestSubscribe(['reminder', 'activity']);
  pref.value = (await m4.reminders.pref(clanId.value).catch(() => null)) ?? pref.value;
  uni.showToast({ title: '已更新订阅', icon: 'none' });
}
const goPerson = (id: string) => uni.navigateTo({ url: `/pages/person/detail?id=${id}` });
</script>

<style scoped>
.row button { margin: 0; }
.day { width: 90rpx; text-align: center; color: #8a6d3b; display: flex; flex-direction: column; }
.day .n { font-size: 40rpx; font-weight: 600; }
.day .u { font-size: 20rpx; }
.day.today { color: #8b1e1e; }
.day.today .n { font-size: 28rpx; }
.set { display: flex; align-items: center; padding: 14rpx 0; border-bottom: 1px dashed #eadfca; }
</style>

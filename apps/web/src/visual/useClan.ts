import { computed, ref } from 'vue';
import type { ClanWithRole } from '@zupu/shared';
import { api, run } from '../api';

/** 当前家族与角色（仅家族管理员/超级管理员可录入） */
export function useClan(clanId: string) {
  const clan = ref<ClanWithRole | null>(null);
  const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
  const load = async () => (clan.value = (await run(api.clans.get(clanId))) ?? null);
  return { clan, isAdmin, load };
}

/** 支系配色 */
export const PALETTE = ['#c0392b', '#2e86ab', '#d68910', '#1e8449', '#7d3c98', '#b03a2e', '#117a65', '#a04000', '#2c3e50', '#d4ac0d'];

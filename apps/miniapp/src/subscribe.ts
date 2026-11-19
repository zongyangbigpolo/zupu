import { m4 } from './api';
import { session } from './session';

/**
 * 请求微信订阅消息授权（必须在用户点击事件中调用）。
 * 一次性订阅：用户每同意一次，后端可发送一条对应模板的消息。
 */
export async function requestSubscribe(kinds: ('reminder' | 'activity')[]): Promise<void> {
  if (!session.loggedIn) return;
  const cfg = await m4.wechat.config().catch(() => null);
  const ids = kinds.map((k) => cfg?.templates[k]).filter((x): x is string => !!x);
  if (!ids.length) return;
  let accepted: string[] = [];
  // #ifdef MP-WEIXIN
  accepted = await new Promise<string[]>((resolve) =>
    uni.requestSubscribeMessage({
      tmplIds: ids,
      success: (r: any) => resolve(ids.filter((id) => r[id] === 'accept')),
      fail: () => resolve([]),
    } as any),
  );
  // #endif
  // #ifndef MP-WEIXIN
  if (cfg?.mock) accepted = ids; // H5 开发模拟
  // #endif
  if (accepted.length) await m4.wechat.addSubscriptions(accepted).catch(() => null);
}

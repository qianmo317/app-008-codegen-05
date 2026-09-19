import type { Box, DestDistance, MoveTask, Truck, UnloadTier } from './types';
import { uid } from './utils';

export const TIER_LABEL: Record<UnloadTier, string> = {
  first: '先卸（靠门/最外面）',
  middle: '中间卸',
  last: '最后卸（最里面）',
};

export const TIER_SHORT: Record<UnloadTier, string> = {
  first: '先卸',
  middle: '中间',
  last: '后卸',
};

export const TIER_COLOR: Record<UnloadTier, string> = {
  first: '#22c55e',
  middle: '#f59e0b',
  last: '#3b82f6',
};

export const DIST_LABEL: Record<DestDistance, string> = {
  1: '近',
  2: '中',
  3: '远',
};

// 装车顺序下各档的排列位置：最后卸的最先装（车厢最里面），先卸的最后装（靠车门）
const TIER_LOAD_ORDER: Record<UnloadTier, number> = {
  last: 0,
  middle: 1,
  first: 2,
};

export function tierOf(box: Box): UnloadTier {
  return box.unloadTier ?? 'middle';
}

export function floorOf(box: Box): number {
  return typeof box.destFloor === 'number' && box.destFloor > 0 ? box.destFloor : 1;
}

export function distOf(box: Box): DestDistance {
  return box.destDist ?? 2;
}

/**
 * 装车次序比较器：返回负数表示 a 要先于 b 装车（即装得更靠里、更靠下）。
 * 1) 卸货档：后卸 → 先装
 * 2) 同档内：楼层高的先装（高层后卸），目的地远的先装
 * 3) 再相同：沉箱先装压底
 * 4) 最后以箱号兜底，保证次序稳定
 */
export function compareLoadOrder(a: Box, b: Box): number {
  const tierDiff = TIER_LOAD_ORDER[tierOf(a)] - TIER_LOAD_ORDER[tierOf(b)];
  if (tierDiff !== 0) return tierDiff;

  const floorDiff = floorOf(b) - floorOf(a);
  if (floorDiff !== 0) return floorDiff;

  const distDiff = distOf(b) - distOf(a);
  if (distDiff !== 0) return distDiff;

  const weightDiff = (b.weightKg ?? 0) - (a.weightKg ?? 0);
  if (weightDiff !== 0) return weightDiff;

  return a.code.localeCompare(b.code, 'zh-Hans-CN', { numeric: true });
}

export function sortBoxesForLoading(boxes: Box[]): Box[] {
  return [...boxes].sort(compareLoadOrder);
}

// 清洗车单：丢弃已删除的箱子、去掉重复 id（同一辆车同一箱只排一次，保留首次出现位置）
export function sanitizeTruck(truck: Truck, validIds: Set<string>): Truck {
  const seen = new Set<string>();
  const boxIds: string[] = [];
  for (const id of truck.boxIds) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      boxIds.push(id);
    }
  }
  return { ...truck, boxIds };
}

export function ensureTrucks(task: MoveTask): Truck[] {
  if (!task.trucks) task.trucks = [];
  return task.trucks;
}

export function createTruck(name: string): Truck {
  return { id: uid(), name, boxIds: [], manual: false, createdAt: Date.now() };
}

// 一箱只能上一辆车：返回除指定车辆外其它车辆已占用的箱 id
export function occupiedByOthers(task: MoveTask, truckId: string): Set<string> {
  const ids = new Set<string>();
  for (const t of task.trucks ?? []) {
    if (t.id === truckId) continue;
    t.boxIds.forEach((id) => ids.add(id));
  }
  return ids;
}

export function boxesOnTruck(task: MoveTask, truck: Truck): Box[] {
  const byId = new Map(task.boxes.map((b) => [b.id, b]));
  return truck.boxIds.map((id) => byId.get(id)).filter((b): b is Box => !!b);
}

/**
 * 按排序规则重排某辆车的装车单。
 * @param changedBoxId 某个箱子的卸货档被修改时传入，仅该箱所在车辆需要重排；
 *                     不传则重排指定车辆本身（临时挪位后的整份重排）
 */
export function reorderTruck(task: MoveTask, truckId: string, changedBoxId?: string): void {
  const trucks = ensureTrucks(task);
  const truck = trucks.find((t) => t.id === truckId);
  if (!truck) return;
  if (changedBoxId !== undefined && !truck.boxIds.includes(changedBoxId)) return;

  const validIds = new Set(task.boxes.map((b) => b.id));
  const onTruck = boxesOnTruck(task, sanitizeTruck(truck, validIds));
  truck.boxIds = sortBoxesForLoading(onTruck).map((b) => b.id);
  // 按规则重排意味着手动次序失效
  truck.manual = false;
}

// 卸货档变更后，整张单子跟着变：重排该箱所在车辆
export function reorderAfterBoxChange(task: MoveTask, boxId: string): void {
  const trucks = ensureTrucks(task);
  const host = trucks.find((t) => t.boxIds.includes(boxId));
  if (host) reorderTruck(task, host.id, boxId);
}

export const LOAD_RULE_TEXT =
  '后卸先装（压里面）→ 同档楼层高先装 → 目的地远先装 → 沉箱压底';

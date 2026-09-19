<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  getTask,
  addVehicle,
  deleteVehicle,
  assignBoxToVehicle,
  removeBoxFromVehicle,
  setBoxUnloadTier,
  resortVehicles,
} from '../db';
import { UNLOAD_TIERS, tierOf, tierLabel, tierColor } from '../utils';
import type { MoveTask, Box, Vehicle, UnloadTier } from '../types';

const route = useRoute();
const task = ref<MoveTask | null>(null);
const pickBox = ref<Record<string, string>>({}); // vehicleId -> 待装车的箱子

const vehicles = computed(() => task.value?.vehicles ?? []);

const assignedIds = computed(() => new Set(vehicles.value.flatMap((v) => v.boxIds)));

const unassigned = computed(() => {
  if (!task.value) return [];
  return task.value.boxes.filter((b) => !assignedIds.value.has(b.id));
});

// 每辆车按装车顺序解析出的箱子列表（boxIds 已按规则排好）
const boxesByVehicle = computed(() => {
  const map = new Map<string, Box[]>();
  if (!task.value) return map;
  for (const v of vehicles.value) {
    map.set(
      v.id,
      v.boxIds.map((id) => task.value!.boxes.find((b) => b.id === id)).filter((b): b is Box => !!b),
    );
  }
  return map;
});

function vehicleBoxes(vehicleId: string): Box[] {
  return boxesByVehicle.value.get(vehicleId) ?? [];
}

async function load() {
  task.value = await getTask(route.params.id as string);
}

async function onAddVehicle() {
  if (!task.value) return;
  await addVehicle(task.value.id, `${vehicles.value.length + 1}号车`);
  await load();
}

async function onDeleteVehicle(v: Vehicle) {
  if (!task.value) return;
  if (!confirm(`确定删除${v.name}？车上的箱子会回到未安排。`)) return;
  await deleteVehicle(task.value.id, v.id);
  await load();
}

async function onAssign(vehicleId: string) {
  if (!task.value) return;
  const boxId = pickBox.value[vehicleId];
  if (!boxId) return;
  await assignBoxToVehicle(task.value.id, vehicleId, boxId);
  pickBox.value[vehicleId] = '';
  await load();
}

async function onRemove(vehicleId: string, boxId: string) {
  if (!task.value) return;
  await removeBoxFromVehicle(task.value.id, vehicleId, boxId);
  await load();
}

async function onTier(box: Box, tier: UnloadTier) {
  if (!task.value) return;
  await setBoxUnloadTier(task.value.id, box.id, tier); // 整份装车单跟着重排
  await load();
}

async function onResort() {
  if (!task.value) return;
  await resortVehicles(task.value.id);
  await load();
}

onMounted(load);
</script>

<template>
  <div v-if="task">
    <div class="header">
      <router-link :to="`/task/${task.id}`" class="back">←</router-link>
      <h1>装车排序</h1>
      <button class="btn no-print" style="padding:8px 14px;font-size:14px;" @click="onResort">全部重排</button>
    </div>
    <div class="page">
      <div class="card" style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
        排序规则：先卸的排在最外面（最后装），最后卸的压车厢最里面；同一档里楼层低、目的地近的先卸，沉的垫底先装。改任一箱子的先后档，整份装车单自动重排。
      </div>

      <button class="btn btn-block" @click="onAddVehicle">+ 添加车辆</button>

      <div v-if="vehicles.length === 0" class="empty">还没有车辆，先添加一辆车</div>

      <div v-for="v in vehicles" :key="v.id" class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="flex:1;">
            <span style="font-weight:700;">{{ v.name }}</span>
            <span style="font-size:12px;color:var(--text-secondary);margin-left:8px;">{{ v.boxIds.length }} 箱</span>
          </div>
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:13px;" @click="onDeleteVehicle(v)">删车</button>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">装车顺序：从上到下 = 车厢最里面 → 车厢门口（最外面）</div>

        <div v-if="v.boxIds.length === 0" class="empty" style="padding:12px 0;">空车，从下方选择箱子装车</div>
        <div v-for="(b, i) in vehicleBoxes(v.id)" :key="b.id" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--border);">
          <span style="width:22px;text-align:center;font-weight:700;color:var(--text-secondary);">{{ i + 1 }}</span>
          <span class="status-dot" :style="{background: tierColor(tierOf(b))}"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;">
              {{ b.code }}
              <span v-if="i === 0" class="tag" style="margin-left:4px;cursor:default;">最里面</span>
              <span v-if="i === v.boxIds.length - 1" class="tag" style="margin-left:4px;cursor:default;border-color:var(--success);color:var(--success);">最外面·先卸</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);">
              {{ b.roomTo }} · {{ b.floorTo ?? 1 }}楼<template v-if="b.distanceKm"> · {{ b.distanceKm }}km</template><template v-if="b.weightKg"> · {{ b.weightKg }}kg</template>
            </div>
            <div style="display:flex;gap:6px;margin-top:6px;">
              <button
                v-for="t in UNLOAD_TIERS"
                :key="t"
                class="tag"
                :class="{active: tierOf(b) === t}"
                @click="onTier(b, t)"
              >{{ tierLabel(t) }}</button>
            </div>
          </div>
          <button class="btn btn-secondary" style="padding:6px 10px;font-size:13px;" @click="onRemove(v.id, b.id)">移出</button>
        </div>

        <div style="display:flex;gap:8px;margin-top:10px;">
          <select class="select" v-model="pickBox[v.id]" style="flex:1;">
            <option value="" disabled>选择要装车的箱子</option>
            <option v-for="b in unassigned" :key="b.id" :value="b.id">
              {{ b.code }} · {{ b.roomTo }} · {{ tierLabel(tierOf(b)) }}
            </option>
          </select>
          <button class="btn" style="padding:8px 14px;font-size:14px;" :disabled="!pickBox[v.id]" @click="onAssign(v.id)">装车</button>
        </div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">未安排装车 ({{ unassigned.length }})</div>
        <div v-if="unassigned.length === 0" class="empty" style="padding:12px 0;">所有箱子都已排入装车单</div>
        <div v-for="b in unassigned" :key="b.id" style="padding:8px 0;border-top:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="status-dot" :style="{background: tierColor(tierOf(b))}"></span>
            <div style="flex:1;">
              <span style="font-weight:700;">{{ b.code }}</span>
              <span style="font-size:12px;color:var(--text-secondary);margin-left:8px;">{{ b.roomTo }} · {{ b.floorTo ?? 1 }}楼</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button
              v-for="t in UNLOAD_TIERS"
              :key="t"
              class="tag"
              :class="{active: tierOf(b) === t}"
              @click="onTier(b, t)"
            >{{ tierLabel(t) }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

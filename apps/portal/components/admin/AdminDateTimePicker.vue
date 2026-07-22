<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { CalendarDate } from "@internationalized/date";

defineOptions({ name: "AdminDateTimePicker" });

const props = defineProps<{
  modelValue?: number | null;
  disabled?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: number | null): void;
}>();

function timestampToCalendarDate(ts?: number | null): CalendarDate | undefined {
  if (!ts || ts <= 0) return undefined;
  const d = new Date(ts);
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function timestampToTimeString(ts?: number | null): string {
  if (!ts || ts <= 0) return "00:00";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const calendarValue = ref<CalendarDate | undefined>(timestampToCalendarDate(props.modelValue));
const timeValue = ref<string>(timestampToTimeString(props.modelValue));

watch(
  () => props.modelValue,
  (newVal) => {
    calendarValue.value = timestampToCalendarDate(newVal);
    timeValue.value = timestampToTimeString(newVal);
  }
);

function updateModel() {
  if (!calendarValue.value) {
    emit("update:modelValue", null);
    return;
  }
  const year = calendarValue.value.year;
  const month = calendarValue.value.month - 1;
  const day = calendarValue.value.day;
  const [hours, minutes] = timeValue.value.split(":").map((num) => parseInt(num, 10) || 0);

  const d = new Date(year, month, day, hours, minutes, 0, 0);
  emit("update:modelValue", d.getTime());
}

function handleCalendarChange(val: unknown) {
  if (val && typeof val === "object" && "year" in val && "month" in val && "day" in val) {
    const v = val as { year: number; month: number; day: number };
    calendarValue.value = new CalendarDate(v.year, v.month, v.day);
  } else {
    calendarValue.value = undefined;
  }
  updateModel();
}

function handleTimeChange(val: string) {
  timeValue.value = val;
  updateModel();
}

function clear() {
  calendarValue.value = undefined;
  timeValue.value = "00:00";
  emit("update:modelValue", null);
}

const formattedDisplay = computed(() => {
  if (!props.modelValue || props.modelValue <= 0) return props.placeholder ?? "选择日期与时间";
  const d = new Date(props.modelValue);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${dateStr} ${timeValue.value}`;
});
</script>

<template>
  <div class="datetime-picker flex items-center gap-1.5">
    <UPopover>
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        icon="i-lucide-calendar"
        class="w-full justify-between"
        :disabled="disabled"
      >
        <span :class="{ 'text-muted-foreground': !modelValue }">{{ formattedDisplay }}</span>
      </UButton>
      <template #content>
        <div class="p-3 flex flex-col gap-3">
          <UCalendar :model-value="(calendarValue as any)" @update:model-value="handleCalendarChange" />
          <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <span class="text-xs font-medium text-muted">具体时间</span>
            <UInput
              type="time"
              size="sm"
              class="w-28"
              :model-value="timeValue"
              @update:model-value="handleTimeChange"
            />
          </div>
        </div>
      </template>
    </UPopover>
    <UButton
      v-if="modelValue"
      type="button"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-x"
      aria-label="清除时间"
      :disabled="disabled"
      @click="clear"
    />
  </div>
</template>

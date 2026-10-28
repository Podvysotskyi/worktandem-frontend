<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const props = withDefaults(defineProps<PrimitiveProps & { class?: HTMLAttributes['class'] }>(), { as: 'button', class: undefined })
const button = cva('inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50')
</script>

<template>
  <Primitive :as="props.as" :as-child="props.asChild" :class="cn(button(), props.class)"><slot /></Primitive>
</template>

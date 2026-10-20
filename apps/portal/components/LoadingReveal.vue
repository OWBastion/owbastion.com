<!-- Wraps a loading / error / content v-if chain. Only client-side swaps animate,
     so server-rendered content appears without motion. The explicit enter
     duration keeps the class on until the last staggered item has landed. -->
<template>
  <Transition name="load-reveal" :duration="{ enter: 560, leave: 0 }">
    <slot />
  </Transition>
</template>

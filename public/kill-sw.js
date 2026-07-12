if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (reg) {
      reg.unregister();
    });
  });
}

if ('caches' in window) {
  caches.keys().then(function (names) {
    names.forEach(function (name) {
      caches.delete(name);
    });
  });
}

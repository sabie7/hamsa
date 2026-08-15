function triggerHeartsAnimation() {
  const heartsContainer = document.createElement('div');
  heartsContainer.style.position = 'fixed';
  heartsContainer.style.top = '0';
  heartsContainer.style.left = '0';
  heartsContainer.style.width = '100vw';
  heartsContainer.style.height = '100vh';
  heartsContainer.style.pointerEvents = 'none';
  heartsContainer.style.zIndex = '999999';
  heartsContainer.style.overflow = 'hidden';
  document.body.appendChild(heartsContainer);

  const colors = ['#ff4d4d', '#ff7b7b', '#ff1a1a', '#e60000', '#ff9999'];
  const heartCount = 40;

  for (let i = 0; i < heartCount; i++) {
    setTimeout(() => {
      const heart = document.createElement('i');
      heart.className = 'fas fa-heart';
      heart.style.position = 'absolute';
      heart.style.bottom = '-50px';
      heart.style.left = Math.random() * 100 + 'vw';
      heart.style.fontSize = (Math.random() * 20 + 15) + 'px';
      heart.style.color = colors[Math.floor(Math.random() * colors.length)];
      heart.style.opacity = Math.random() * 0.5 + 0.5;
      heart.style.transform = `rotate(${Math.random() * 360}deg)`;
      heart.style.transition = `transform ${Math.random() * 2 + 3}s linear, bottom ${Math.random() * 2 + 3}s ease-in, opacity ${Math.random() * 2 + 3}s ease-out`;
      
      heartsContainer.appendChild(heart);

      // Trigger animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          heart.style.bottom = '120vh';
          heart.style.transform = `rotate(${Math.random() * 360 + 360}deg)`;
          heart.style.opacity = '0';
        });
      });

      // Remove heart after animation
      setTimeout(() => {
        heart.remove();
      }, 5000);
    }, Math.random() * 2000);
  }

  // Remove container after all animations
  setTimeout(() => {
    heartsContainer.remove();
  }, 8000);
}

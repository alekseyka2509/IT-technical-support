
const burgerBtn = document.querySelector('.burger-btn');
const burgerMenu = document.querySelector('.burger-menu');

let isHovered = false;

burgerBtn.addEventListener('mouseenter', () => {
  burgerMenu.classList.add('open');
});

burgerBtn.addEventListener('mouseleave', () => {
  setTimeout(() => {
    if (!isHovered) burgerMenu.classList.remove('open');
  }, 100);
});

burgerMenu.addEventListener('mouseenter', () => {
  isHovered = true;
  burgerMenu.classList.add('open');
});

burgerMenu.addEventListener('mouseleave', () => {
  isHovered = false;
  burgerMenu.classList.remove('open');
});

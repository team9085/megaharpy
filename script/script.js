const slides = document.querySelector(".slides");
const slideElements = document.querySelectorAll(".slide");

const TOTAL_SLIDES = slideElements.length - 2;
const FIRST_SLIDE = 1;
const LAST_SLIDE = TOTAL_SLIDES;
const COPY_FIRST = TOTAL_SLIDES + 1;
const COPY_LAST = 0;

let index = FIRST_SLIDE;
let animating = false;

function updateCarousel(animate = true) {
    slides.style.transition = animate
        ? "transform 0.5s ease"
        : "none";

    slides.style.transform = `translateX(-${index * 100}%)`;
}

function next() {
    if (animating) return;
    animating = true;
    index++;

    updateCarousel();
}

function previous() {
    if (animating) return;
    animating = true;
    index--;

    updateCarousel();
}

slides.addEventListener("transitionend", () => {

    if (index === COPY_FIRST) {
        index = FIRST_SLIDE;
        updateCarousel(false);
    }

    else if (index === COPY_LAST) {
        index = LAST_SLIDE;
        updateCarousel(false);
    }

    animating = false;
});

updateCarousel(false);
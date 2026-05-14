const catalog = document.querySelector("#programCatalog");

async function loadPrograms() {
  const response = await fetch("data/programs.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load programs");
  }
  return response.json();
}

function renderCatalog(programs) {
  catalog.innerHTML = programs
    .map(
      (program) => `
        <article class="program-card catalog-card">
          <h3>${program.nameZh} / ${program.nameEn}</h3>
          <small>${program.concentrationsZh.join(" / ")}</small>
          <a href="${program.officialUrl}" target="_blank" rel="noreferrer">官网专业页</a>
        </article>
      `
    )
    .join("");
}

loadPrograms()
  .then(renderCatalog)
  .catch(() => {
    catalog.innerHTML = `<article class="warning-card danger"><strong>专业目录加载失败</strong><p>请刷新页面或稍后再试。</p></article>`;
  });

document.addEventListener("DOMContentLoaded", function () {

    console.log("JS LOADED!");

    const form = document.getElementById("engineerTest1");
    if (!form) return;

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        // 五行計分（A〜E）
        let scores = { A: 0, B: 0, C: 0, D: 0, E: 0 };

        for (let i = 1; i <= 10; i++) {
            const selected = document.querySelector(`input[name="Q${i}"]:checked`);
            if (selected) {
                scores[selected.value]++;
            }
        }

        // 取最高
        let result = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

        // A〜E → 五行
        const typeMap = {
            A: "wood",
            B: "fire",
            C: "earth",
            D: "metal",
            E: "water"
        };

        let finalType = typeMap[result] || "neutral";

        // 跳轉到結果頁
        window.location.href = `https://ggeggsong.com/engineer-test1-result/?type=${finalType}`;
    });
});

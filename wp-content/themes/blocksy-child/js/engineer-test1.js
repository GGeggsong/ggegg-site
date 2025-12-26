document.addEventListener("DOMContentLoaded", function () {

    console.log("JS LOADED!");

    const form = document.getElementById("engineerTest1");
    if (!form) return;

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        // 組 URL 參數
        let query = [];

        for (let i = 1; i <= 10; i++) {
            const selected = document.querySelector(`input[name="Q${i}"]:checked`);
            let val = selected ? selected.value : "X"; // X = 我不知道
            query.push(`Q${i}=${val}`);
        }

        const finalURL = "https://ggeggsong.com/engineer-test1-result/?" + query.join("&");

        console.log("跳轉 URL =", finalURL);  // <==== 你要看的就在這
        window.location.href = finalURL;
    });
});

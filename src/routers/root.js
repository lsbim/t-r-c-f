const { Suspense, lazy } = require("react");
const { createBrowserRouter } = require("react-router-dom");

const IndexPage = lazy(() => import("../pages/IndexPage.js"));
const ImageSlicePage = lazy(() => import("../pages/ImageSlicePage.js"));
const ImageFilterPage = lazy(() => import("../pages/ImageFilterPage.js"));

// suspense => 컴포넌트 로딩 전까지(비동기) 보여줄 화면(fallback).
const router = createBrowserRouter([
    {
        path: "/",
        element: <Suspense><ImageSlicePage /></Suspense>

    },
    {
        path: "/slice",
        element: <Suspense><ImageSlicePage /></Suspense>
    },
    {
        path: "/filter",
        element: <Suspense><ImageFilterPage /></Suspense>
    },
    {
        path: "/data",
        element: <Suspense><IndexPage /></Suspense>
    },
    {
        path: "*",
        element: <Suspense><ImageSlicePage /></Suspense>
    }
]
    // , { basename: "/" } github pages에 사용되었음
)

export default router;
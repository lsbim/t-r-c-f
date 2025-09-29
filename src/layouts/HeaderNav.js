import { Link, useLocation } from "react-router-dom";

const HeaderNav = () => {
    const { pathname } = useLocation();

    return (
        <div className="w-full flex justify-center items-center py-4 shadow-md gap-10 mb-[100px]">
            <Link
                to={"/slice"}
                className={`cursor-pointer hover:text-gray-600 duration-300 font-bold ${pathname.startsWith("/slice") || pathname.endsWith("/") ? "" : "text-gray-400"}`}>
                캐릭터 비교용 이미지 추출
            </Link>
            <Link
                to={"/data"}
                className={`cursor-pointer hover:text-gray-600 duration-300 font-bold ${pathname.startsWith("/data") ? "" : "text-gray-400"}`}>
                통계용 데이터 JSON 추출
            </Link>
            <Link
                to={"/filter"}
                className={`cursor-pointer hover:text-gray-600 duration-300 font-bold ${pathname.startsWith("/filter") ? "" : "text-gray-400"}`}>
                이미지 필터 적용해보기
            </Link>
        </div>
    );
}

export default HeaderNav;
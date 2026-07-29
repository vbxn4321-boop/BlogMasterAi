// .data-table 사용처를 감싸는 가로 스크롤 래퍼 — 좁은 화면에서 표가 잘리지 않게 한다.
export default function ResponsiveTable({ children }) {
    return <div className="table-scroll">{children}</div>;
}

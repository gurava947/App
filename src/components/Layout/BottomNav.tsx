import { navigation } from "../../data/appData";
import type { Page } from "../../types";
import { Icon } from "../Icon";

export function BottomNav({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">{navigation.map((item) => <button key={item.id} className={`nav-item${page === item.id ? " active" : ""}`} onClick={() => onNavigate(item.id)} aria-current={page === item.id ? "page" : undefined}><span className="nav-icon-wrap"><Icon name={item.icon} size={21} /></span><span>{item.id}</span></button>)}</nav>;
}

import { Link } from 'react-router-dom';

/** The official artwork is kept intact on a contrasting brand surface. */
export function Brand() {
  return (
    <Link to="/" aria-label="SchoolsGhar home" className="flex items-center h-full transition-transform hover:scale-[1.02] ml-2">
      <img src="/logo-blue.png" alt="SchoolsGhar" className="h-12 w-auto object-contain scale-[1.20] origin-left" />
    </Link>
  );
}

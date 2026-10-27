import { NavLink } from "react-router-dom";
import styles from "./Navbar.module.css";
import { navLinks } from "../../data/navbar.js";
import { Button } from "../Button/Button";
import { useState, useEffect } from "react";
import { Menu, X, ShoppingCart } from "lucide-react";
import { useCart } from "../../context/useCart.js";
import { motion } from "motion/react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { items } = useCart();

  const cartCount = items.reduce(
    (total, item) => total + item.quantity,
    0
  );

  useEffect(() => {
    if (!menuOpen) return;

    const scrollY = window.scrollY;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";

      window.scrollTo(0, scrollY);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 bg-[var(--color-surface-warm)]/90">
      <section className="mx-auto max-w-7xl px-4">
        <div className="flex items-center justify-between py-2 md:h-30 md:py-0">
          <div className="flex items-center justify-between gap-6">
            <NavLink
              to="/"
              className={`flex items-center gap-3 ${styles.logo}`}
            >
              <img
                src="/logo.png"
                alt="Empowering Biz Logo"
                className="h-12 w-auto md:h-16"
              />

              <span className={styles.logoText}>
                <span>Empowering Biz</span>
                <span className={styles.highlight}>
                  An Empowering Minds Initiative
                </span>
              </span>
            </NavLink>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.link} ${styles.active}`
                    : styles.link
                }
              >
                {link.name}
              </NavLink>
            ))}

            <Button
              variant="primary"
              as={NavLink}
              to="/contact"
            >
              Contact Us
            </Button>

            <Button
              variant="icon"
              as={NavLink}
              to="/cart"
              className={styles.cartLink}
            >
              <ShoppingCart />

              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  className={styles.cartBadge}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 20,
                  }}
                >
                  {cartCount}
                </motion.span>
              )}
            </Button>
          </nav>

          <button
            className={styles.menuButton}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </section>

      {menuOpen && (
        <button
          className={styles.backdrop}
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
      )}

      <nav
        className={`${styles.mobileMenu} ${
          menuOpen ? styles.mobileMenuOpen : ""
        }`}
      >
        {navLinks.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              isActive
                ? `${styles.link} ${styles.active}`
                : styles.link
            }
          >
            {link.name}
          </NavLink>
        ))}

        <NavLink
          to="/contact"
          onClick={() => setMenuOpen(false)}
        >
          <Button variant="primary">
            Contact Us
          </Button>
          <Button
              variant="icon"
              as={NavLink}
              to="/cart"
              className={styles.cartLink}
            >
              <ShoppingCart />

              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  className={styles.cartBadge}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 20,
                  }}
                >
                  {cartCount}
                </motion.span>
              )}
            </Button>
        </NavLink>
      </nav>
    </header>
  );
}

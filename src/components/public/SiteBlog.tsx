import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ArrowLeft } from "lucide-react";
import type { PublicBlogPost } from "@/lib/cms/blog-public";
import styles from "./site-pages.module.css";

function postDate(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? at.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";
}

/**
 * The blog index (October 16, XA restraint): a reading list, newest first, one
 * hairline between posts. No uppercase dates, no cards, no topic chips that
 * look clickable but filter nothing. With no posts it says
 * so in a sentence under the heading, left aligned.
 */
export function SiteBlogIndex({ siteName, posts }: { siteName: string; posts: readonly PublicBlogPost[] }) {
  return <section className={styles.page} aria-labelledby="site-blog-title">
    <h1 id="site-blog-title" className={styles.title}>Blog</h1>
    {posts.length === 0 ? <p className={styles.lede}>No posts yet. New writing from {siteName} will appear here.</p> : <>
      <p className={styles.lede}>Notes and news from {siteName}.</p>
      <ul className={styles.posts}>
        {posts.map(post => <li key={post.id}>
          <Link href={`/blog/${post.slug}`} className={styles.post}>
            <p className={styles.meta}><time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>{post.author ? ` · ${post.author}` : ""}</p>
            <h2 className={styles.postTitle}>{post.title}</h2>
            {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}
          </Link>
        </li>)}
      </ul>
    </>}
  </section>;
}

/** One post as a reading column. The body is markdown; react-markdown renders no raw HTML. */
export function SiteBlogPost({ post }: { post: PublicBlogPost }) {
  return <article className={styles.page} aria-labelledby="site-post-title">
    <Link href="/blog" className={styles.back}><ArrowLeft size={16} aria-hidden="true" />All posts</Link>
    <header className={styles.article}>
      <h1 id="site-post-title" className={styles.title}>{post.title}</h1>
      <p className={styles.byline}>{[post.author, postDate(post.publishedAt)].filter(Boolean).join(" · ")}</p>
    </header>
    <div className={styles.prose}>
      <ReactMarkdown components={{
        h1: ({ children }) => <h2>{children}</h2>,
        a: ({ href, children }) => <a href={href} rel="noopener noreferrer">{children}</a>,
      }}>{post.content}</ReactMarkdown>
    </div>
  </article>;
}

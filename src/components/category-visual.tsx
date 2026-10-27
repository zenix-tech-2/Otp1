"use client";
import {BookOpen,BriefcaseBusiness,Code2,Gamepad2,Globe2,GraduationCap,Music2,Package,Palette,Sparkles} from "lucide-react";
import type {StoreCategory} from "@/lib/categories";
import {BrandIcon} from "./ui";
const icons={package:Package,code:Code2,book:BookOpen,gamepad:Gamepad2,music:Music2,globe:Globe2,sparkles:Sparkles,briefcase:BriefcaseBusiness,graduation:GraduationCap,palette:Palette};
export function CategoryVisual({category}:{category:Pick<StoreCategory,"name"|"icon"|"color"|"imageUrl">}){
 if(category.imageUrl)return <img className="custom-category-art" src={category.imageUrl} alt="" width={58} height={58}/>;
 if(category.icon==="social")return <span className="social-icons"><BrandIcon brand="facebook" size={32}/><BrandIcon brand="tiktok" size={32}/><BrandIcon brand="instagram" size={32}/><BrandIcon brand="x" size={32}/></span>;
 if(category.icon==="netflix")return <span className="netflix-service-icon"><BrandIcon brand="netflix" size={50}/><span className="subscription-plus">+</span></span>;
 if(["sim","server","crown","gift"].includes(category.icon))return <img className="service-art" src={`/images/${category.icon}.webp`} width={72} height={72} alt=""/>;
 const Icon=icons[category.icon as keyof typeof icons]||Package;return <span className={`category-vector-icon category-vector-${category.color}`}><Icon size={31} strokeWidth={1.7}/></span>;
}

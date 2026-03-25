# IIDX　楽曲名　特徴

## 概要

音楽ゲーム「beatmania IIDX」の楽曲名における特徴をまとめる。
楽曲名については、以下のような特徴がある。

### 区切り文字、囲み文字
- IIDXの楽曲名には、csvにおける区切り文字、囲み文字が含まれるものがある。楽曲の例として、以下のようなものがある。

例：
  - Anisakis-somatic mutation type "Forza"-

この楽曲名においては、chinimuruhi氏が提供しているデータセットにおいて、機種依存文字などをパターンで置き換えたものを提供しているものがあるため、そちらを利用することができる。以下のように置き換えてデータ格納における区切り文字、囲み文字の対応をする。

  - Anisakis-somatic mutation type \"Forza\"-"

単語間の空白は、元の楽曲名のデータを使用する。区切り文字、囲み文字については、置き換え後の楽曲名のデータを使用する。

### 機種依存文字
- IIDXの楽曲名には、機種依存文字が含まれることがある。それは、今回使用するデータセットにおいても含まれる。

例：
- 焱影
- 閠槞彁の願い
- POLꓘAMAИIA
- Ōu Legends
- ⁽ଘ( ˙꒳˙ )ଓ⁾⁾ beyond reason

このパターンにおいても、chinimuruhi氏が提供しているデータセットにおいて、機種依存文字などをパターンで置き換えたものを提供しているものがあるため、そちらを利用することができる。

https://chinimuruhi.github.io/IIDX-Data-Table/textage/normalized-title.json

上記の例の楽曲名それぞれにおいて、今回使用する元の曲名のデータ（https://chinimuruhi.github.io/textage/title.json）と置き換えた曲名のデータ（https://chinimuruhi.github.io/IIDX-Data-Table/textage/normalized-title.json）
）でIDで対応させた置き換え後の曲名は以下となる。

例（括弧で閉じられたものはIDを示す）：
- 火影(焱影)
- 閠槞彁の願い（閠槞彁の願い）
- POLKAMANIA(POLꓘAMAИIA)
- "OuLegends"(OuLegends)
- "⁽⁽ଘ(˙꒳˙)ଓ⁾⁾beyondreason"(⁽⁽ଘ( ˙꒳˙ )ଓ⁾⁾ beyond reason)

- ページ上に記載する曲名は、できるだけ元の曲名のデータを使用する。機種依存文字などによる文字化けなどの影響が大きい場合は、置き換え後の曲名を利用する。

- 単語感の空白は、元の曲名のデータを使用する。

### 大文字小文字が異なるが、綴りが同一の楽曲
- IIDXの楽曲名には、大文字小文字が違う曲名が同一の楽曲であることが存在する。その楽曲を示す。（）はアーティスト名を表す。

例：
- SHOOTING STAR(小坂　りゆ)
- Shootiing Star（ReGROSS）

実装時点では、大文字小文字の違いで判別できるため、今回はその問題に他対応しないものとする。その場合で問題が生じた場合はあらためて対応するものとする。
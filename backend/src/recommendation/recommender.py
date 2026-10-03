from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer


class Recommender:

    def __init__(self, data_path="data.csv", top_n=5):
        project_root = Path(__file__).resolve().parents[2]
        data_file = Path(data_path)

        if not data_file.is_absolute():
            data_file = project_root / data_file

        self.data_path = str(data_file)
        self.top_n = top_n

        self.df = pd.read_csv(self.data_path)

        self.df["recommendation_text"] = (
            self.df["title"].fillna("") + " " +
            self.df["description"].fillna("") + " " +
            self.df["brand"].fillna("") + " " +
            self.df["categories"].fillna("") + " " +
            self.df["features"].fillna("")
        )

        self.tfidf = TfidfVectorizer(
            stop_words="english",
            max_features=5000
        )

        self.tfidf_matrix = self.tfidf.fit_transform(
            self.df["recommendation_text"]
        )

        self.similarity = (
            self.tfidf_matrix @ self.tfidf_matrix.T
        ).toarray()

    def recommend(self, product_title):

        matches = self.df[
            self.df["title"].str.lower() == product_title.lower()
        ]

        if matches.empty:
            return []

        product_index = matches.index[0]

        scores = list(
            enumerate(self.similarity[product_index])
        )

        scores = sorted(
            scores,
            key=lambda x: x[1],
            reverse=True
        )

        recommendations = scores[1:self.top_n + 1]

        results = self.df.iloc[
            [i[0] for i in recommendations]
        ][
            ["title", "brand", "categories"]
        ].copy()

        results["similarity_score"] = [
            round(score, 3)
            for _, score in recommendations
        ]

        return results.to_dict(orient="records")
